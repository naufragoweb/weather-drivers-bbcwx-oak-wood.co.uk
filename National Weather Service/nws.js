// National Weather Service Driver JSON API 2.5.1 - Refactored Version
// Created using ECMAScript 6 standart

const UUID = 'bbcwx@oak-wood.co.uk';
const DESKLET_DIR = imports.ui.deskletManager.deskletMeta[UUID].path;
imports.searchPath.push(`${DESKLET_DIR}/drivers`);
const wxBase = imports.wxbase;
const GLib = imports.gi.GLib;
const Gettext = imports.gettext;

const { SERVICE_STATUS_ERROR, SERVICE_STATUS_OK, SERVICE_STATUS_INIT } = wxBase;
const MAX_DAYS = 7;

Gettext.bindtextdomain(UUID, `${GLib.get_home_dir()}/.local/share/locale`);

var currentDriverInstance = null;

var Driver = class Driver extends wxBase.Driver {
  constructor(stationID, version) {
    super(stationID);
    this.version = version;
    currentDriverInstance = this;
    this.maxDays = MAX_DAYS;

    this.capabilities.meta.country = false;
    this.capabilities.cc.feelslike = false;
    this.capabilities.cc.pressure_direction = false;
    this.capabilities.forecast.pressure = false;
    
    this.drivertype = 'nws';
    this.linkText = 'https://www.weather.gov/';
    this.linkURL = 'https://forecast.weather.gov/';
    this._baseURL = 'https://api.weather.gov/';
    this._languageURL = `https://translate.googleapis.com/translate_a/single`;
    this.userAgent = `(${UUID} ${this.version}; Contact: https://github.com/linuxmint/cinnamon-spices-desklets/issues)`;
    this.linkIcon = { file: 'nws', width: 50, height: 50 };

    // Language Code Mapping for Google Weather API (BCP-47)
    // Lowercase keys to match output of GLib.get_language_names() after toLowerCase() in wxbase.js
    this.lang_map = {
      'ar': 'ar', 
      'bg': 'bg', 
      'bn': 'bn', 
      'ca': 'ca', 
      'cs': 'cs', 
      'da': 'da', 
      'de': 'de', 
      'el': 'el',
      'en': 'en', 'en_gb': 'en-GB', 'en_us': 'en-US',
      'es': 'es', 'es_es': 'es-ES', 'es_419': 'es-419', // Espanhol (Latin America)
      'fa': 'fa', 
      'fi': 'fi', 
      'fr': 'fr', 'fr_ca': 'fr-CA',
      'he': 'iw', // Google use 'iw' for Hebrew
      'hi': 'hi', 
      'hr': 'hr', 
      'hu': 'hu', 
      'id': 'id', 
      'it': 'it', 
      'ja': 'ja', 
      'ko': 'ko',
      'lt': 'lt', 
      'lv': 'lv', 
      'ml': 'ml', 
      'mr': 'mr', 
      'ms': 'ms', 
      'nb': 'no', // Norueguês Bokmål
      'nl': 'nl', 
      'pl': 'pl', 
      'pt': 'pt', 'pt_pt': 'pt-PT',
      'pt_br': 'pt-BR', 
      'ro': 'ro', 
      'ru': 'ru', 
      'sk': 'sk', 
      'sl': 'sl', 
      'sr': 'sr', 
      'sv': 'sv', 
      'sw': 'sw',
      'ta': 'ta', 
      'te': 'te', 
      'th': 'th', 
      'tr': 'tr', 
      'uk': 'uk', 
      'ur': 'ur', 
      'vi': 'vi',
      'zh_cn': 'zh-CN', 'zh_hans': 'zh-Hans', 'zh_hant': 'zh-Hant', 'zh_hk': 'zh-HK', 'zh_tw': 'zh-TW'
    };

  }

  _emptyData() {
    this.data = {
      city: '',
      region: '',
      wgs84: { lat: '', lon: '' },
      cc: {
        has_temp: '', 
        humidity: '', 
        icon: '', 
        temperature: '',
        visibility: '', 
        weathertext: '', 
        wind_direction: '', 
        wind_speed: ''
      },
      days: Array(MAX_DAYS).fill().map(() => ({
        day: '', 
        humidity: '', 
        icon: '', 
        maximum_temperature: '',
        minimum_temperature: '', 
        weathertext: '', 
        wind_direction: '', 
        wind_speed: ''
      })),
      status: {}
    };
  }

  async refreshData(deskletObj) {
    
    if (!await this._verifyStation()) {
      this._showError(deskletObj, await _(this.data.status.lasterror));
      return;
    }
    try {

      this.data.status = {
        cc: SERVICE_STATUS_INIT,
        forecast: SERVICE_STATUS_INIT,
        meta: SERVICE_STATUS_INIT,
        lasterror: false
      }

      this.locationURL = `${this._baseURL}points/${this.latlon[0]},${this.latlon[1]}`;
      this.meta = await this._loadData(this.locationURL, 'meta');
      if (this.meta) {
        await this._parseURLs(this.meta);
      } else {
        this.data.status.meta = SERVICE_STATUS_ERROR;
        global.logError('NWS: Failed to acquire URLs data in points API.');
        return false;
      }

      if (this.observationURL) {
        this.stationsID = await this._loadData(this.observationURL, 'observation stations');
      } else {
        this.data.status.cc = SERVICE_STATUS_ERROR;
        global.logError('NWS: Failed to parse metadata in "meta" constant.');
        return false
      }

      if (this.stationID) {
        await this._parseObsStation(this.stationsID);
      } else {
        this.data.status.cc = SERVICE_STATUS_ERROR;
        global.logError('NWS: Failed to acquire data in observations API.');
        return false;
      }

      if (this.obsStationID) {
        this.lastestURL =`${this._baseURL}/stations/${this.obsStationID}/observations/latest`;
      } else {
        this.data.status.cc = SERVICE_STATUS_ERROR;
        global.logError('NWS: Failed to acquire station data in observations API.');
        return false;
      }
   
      const [lastest, forecast1h, forecast12h, forecastDaily] = await Promise.all([
        this._loadData(this.lastestURL, 'lastest'),
        this._loadData(this.forecast1hURL, 'forecast 1h', this._params()),
        this._loadData(this.forecast12hURL, 'forecast 12h', this._params()),
        this._loadData(this.forecastDailyURL, 'forecast daily')
      ]);

      this._emptyData();
      
      // Data process
      await Promise.all([
        this._parseMetaData(this.meta),
        this._parseCurrentData(lastest, forecast1h),
        this._parseForecastData(forecast1h, forecast12h, forecastDaily),
      ]);

      this.linkURL = `https://forecast.weather.gov/MapClick.php?textField1=${this.data.wgs84.lat}&textField2=${this.data.wgs84.lon}`;

      deskletObj.displayMeta();
      deskletObj.displayCurrent();
      deskletObj.displayForecast();

      return true;
    } catch (err) {
      global.logError(`NWS Driver error: ${err.message}`);
      this._showError(deskletObj, _('An unexpected error occurred: %s').format(err.message));
      return false;
    }
  }

  _params() {
    return { units: 'si' };
  }

  _paramsTranslate(query) {
    return {
      client: 'gtx',
      sl: 'en',
      tl: this.getLangCode(),
      dt: 't',
      q: query,
      ie: 'UTF-8',
      oe: 'UTF-8'
    };
  }

  async _verifyStation() {
    if (!this.stationID || typeof this.stationID !== 'string' || this.stationID.trim() === "") {
      this._emptyData();
      this.data.status.meta = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = 'Location\nis empty or not defined.';
      this.latlon = [];
      
      return false;
    }
   // Regex to strictly match the format "lat,lon", allowing spaces around the comma.
    const latLon = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;
    const match = this.stationID.match(latLon);

    if (!match) {
      this._emptyData();
      this.data.status.meta = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = 'Invalid Location format.\nExpected: latitude,longitude';
      this.latlon = [];
      return false;
    }

    const lat = parseFloat(match[1]);
    const lon = parseFloat(match[2]);

    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      this._emptyData();
      this.data.status.meta = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = 'Invalid values\nof latitude or longitude.';
      this.latlon = [];
      return false;
    }

    this.latlon = [lat, lon];
    return true;
  }

  _getWeatherAsync(url, params = null) {
    return new Promise((resolve, reject) => {
      this._getWeather(url, weather => 
        weather ? resolve(weather) : reject(new Error(`Failed to retrieve data from ${url}`))
      , params, this.userAgent);
    });
  }

  async _loadData(URL, API, params) {
    try {
      let rawData;
      if (URL.includes(this.forecast1hURL) || 
          URL.includes(this.forecast12hURL) ||
          URL.includes(this._languageURL)) {
      rawData = await this._getWeatherAsync(URL, params);
      }
      if (URL.includes(this.locationURL) ||
          URL.includes(this.observationURL) ||
          URL.includes(this.lastestURL) ||
          URL.includes(this.forecastDailyURL)) {
      rawData = await this._getWeatherAsync(URL);
      }
      const json = JSON.parse(rawData);
      return json ? json : false;
    } catch (err) {
      global.logError(`NWS: Error loading data ${API}: ${err.message}`);
      return false;
    }
  }  

  async _parseURLs(meta) {
    try {
      this.baseURL = meta.properties.forecast;
      this.observationURL = meta.properties.observationStations;
      this.forecast1hURL = meta.properties.forecastHourly;
      this.forecast12hURL = meta.properties.forecast;
      this.forecastDailyURL = meta.properties.forecastGridData;
      return true;
    } catch (err) {
      global.logError(`NWS: error parsing URLs: ${err.message}`);
      return false;
    }
  }

  async _parseObsStation(obsStationsID) {
    try {
      this.obsStationID = obsStationsID.features[0].properties.stationIdentifier;
      return true;
    } catch (err) {
      global.logError(`NWS: error parsing observation station ID: ${err.message}`);
      return false;
    }
  }

  async _parseMetaData(meta) {
    try{
      const location = meta.properties.relativeLocation;
      Object.assign(this.data, {
        city: location.properties.city,
        region: location.properties.state,
        wgs84: {
          lat: location.geometry.coordinates[1],
          lon: location.geometry.coordinates[0]
        }
      });  
      this.data.status.meta = SERVICE_STATUS_OK;
    } catch (err) {
      global.logError(`NWS: error parsing meta data: ${err.message}`);
      this.data.status.meta = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = await _(`Error processing location data:\n`) + err.message;
    }
    return true;
  }

  async _parseCurrentData(lastest, forecast1h) {
    try {
      const current = lastest.properties;
      const current1h = forecast1h.properties.periods[0];
      const isDaytime = current1h.isDaytime;

      Object.assign(this.data.cc, {
        temperature: current.temperature.value ?? current1h.temperature,
        humidity: current.relativeHumidity.value ?? current1h.relativeHumidity,
        pressure: Math.round(current.barometricPressure.value / 100),
        wind_speed: current.windSpeed.value ?? (current1h.windSpeed?.match(/\d+/)?.[0] ?? null),
        wind_direction: this.compassDirection(current.windDirection?.value) ?? current1h.windDirection,
        visibility: current.visibility.value != null ? Math.round(current.visibility.value / 1000) : '', // Adicionada verificação para null/undefined
        icon: this._mapIcon((current.icon ?? current1h.icon).split('?')[0].split('/').pop().split(',')[0], isDaytime),
        weathertext: await this._mapDescription((current.textDescription || current1h.shortForecast), isDaytime),
        //weathertext: await _(current.textDescription) ?? await _(current1h.shortForecast),
        has_temp: true
      });
      
      this.data.status.cc = SERVICE_STATUS_OK;
    } catch (err) {
      global.logError(`NWS: error parsing current data: ${err.message}`);
      this.data.status.cc = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = await _(`Error processing current data:\n`) + err.message;
    }
    return true;
  }

  async _parseForecastData(forecast1h, forecast12h, forecastDaily) {
    try {
      const isDaytime = forecast1h.properties.periods[0].isDaytime;
      const periods12h = forecast12h.properties.periods;
      const dailyProps = forecastDaily.properties;

       // Process day 0 (today)
      const period0 = periods12h[0];
      Object.assign(this.data.days[0], {
        day: this._getDayName(0),
        icon: this._mapIcon(period0.icon.split('?')[0].split('/').pop().split(',')[0], isDaytime),
        weathertext: await this._mapDescription(period0.shortForecast, isDaytime),
        //weathertext: await _(period0.shortForecast),
        wind_speed: period0.windSpeed.match(/\d+/) ? Number(period0.windSpeed.match(/\d+/)[0]) : '',
        wind_direction: period0.windDirection ?? '',
        maximum_temperature: dailyProps.maxTemperature?.values[0]?.value ?? '',
        minimum_temperature: dailyProps.minTemperature?.values[0]?.value ?? '',
        humidity: dailyProps.relativeHumidity?.values[0]?.value ?? ''
        //pressure: Math.round(dailyProps.pressure.values[0].value / 100),
      });

      // --- Aggregation of forecastDaily values ​​by dayOffset (1 to maxDays-1) ---
      const dailyAggregatedValues = {};

      // Calculates the UTC start of the day of the first forecast as the basis for offsets
      const baseDayStartForOffset = new Date(Date.UTC(
        new Date(periods12h[0].startTime).getUTCFullYear(),
        new Date(periods12h[0].startTime).getUTCMonth(),
        new Date(periods12h[0].startTime).getUTCDate()
      ));

      const getDayOffset = (timeStr) => {
        const entryDay = new Date(Date.UTC(
          new Date(timeStr.split('/')[0]).getUTCFullYear(),
          new Date(timeStr.split('/')[0]).getUTCMonth(),
          new Date(timeStr.split('/')[0]).getUTCDate()));
        return Math.round((entryDay.getTime() - baseDayStartForOffset.getTime()) / (1000 * 60 * 60 * 24));
      };
      
      const propToFieldMap = {
        maxTemperature: 'maxTemps',
        minTemperature: 'minTemps',
        relativeHumidity: 'humidities',
        pressure: 'pressuresPa'
      };

      Object.keys(propToFieldMap).forEach(propName => {
        if (!dailyProps[propName]?.values) return;
        
        dailyProps[propName].values.forEach(entry => {
          const dayOffset = getDayOffset(entry.validTime);
          if (dayOffset >= 1 && dayOffset < this.maxDays) {
            if (!dailyAggregatedValues[dayOffset]) {
              // Initializes the object to the offset if it does not already exist
              dailyAggregatedValues[dayOffset] = { maxTemps: [], minTemps: [], humidities: [], pressuresPa: [] };
            }
            const fieldName = propToFieldMap[propName];
            dailyAggregatedValues[dayOffset][fieldName].push(entry.value);
          }
        });
      });

      // --- Processing forecast days (1 to maxDays-1) ---
      for (let i = 1; i < this.maxDays; i++) {
        Object.assign(this.data.days[i].day = this._getDayName(i));

        // Calculates the target local date for day 'i'
        const targetLocalDate = new Date(new Date(periods12h[0].startTime));
        targetLocalDate.setDate(new Date(periods12h[0].startTime).getDate() + i);
        
        const targetYear = targetLocalDate.getFullYear();
        const targetMonth = ('0' + (targetLocalDate.getMonth() + 1)).slice(-2);
        const targetDay = ('0' + targetLocalDate.getDate()).slice(-2);
        const targetDayKey = `${targetYear}-${targetMonth}-${targetDay}`; // Format YYYY-MM-DD

        // Find the corresponding 12h period (daytime, 06:00)
        const periodForDay = periods12h.find(p => {
          if (!p.startTime || typeof p.isDaytime !== 'boolean') return false;
          
          const pStartTimeString = p.startTime; // ex: "2024-03-18T06:00:00-07:00"
          const periodLocalDayString = pStartTimeString.substring(0, 10); // ex: "2024-03-18"
          const periodLocalHourString = pStartTimeString.substring(11, 13); // ex: "06"

          return periodLocalDayString === targetDayKey && 
                 periodLocalHourString === "06" && // Assuming "06" is the target time
                 p.isDaytime === true; // We want the daytime period
        });

        if (periodForDay) {
          Object.assign(this.data.days[i], {
          icon: this._mapIcon(periodForDay.icon.split('?')[0].split('/').pop().split(',')[0], true),
          weathertext: await this._mapDescription(periodForDay.shortForecast, true),
          //weathertext: await _(periodForDay.shortForecast),
          wind_speed: periodForDay.windSpeed.match(/\d+/) ? Number(periodForDay.windSpeed.match(/\d+/)[0]) : '',
          wind_direction: periodForDay.windDirection ?? '',
        });
        }

        // Assigns the aggregated values ​​of forecastDaily
        const aggregated = dailyAggregatedValues[i];
        if (aggregated) {
          if (aggregated.maxTemps.length) Object.assign(this.data.days[i].maximum_temperature = Math.max(...aggregated.maxTemps));
          if (aggregated.minTemps.length) Object.assign(this.data.days[i].minimum_temperature = Math.min(...aggregated.minTemps));
          if (aggregated.humidities.length) Object.assign(this.data.days[i].humidity = Math.max(...aggregated.humidities)); // Keep Math.max as original
          
          const validPressures = aggregated.pressuresPa.filter(val => typeof val === 'number' && val !== null);
          if (validPressures.length > 0) {
            Object.assign(this.data.days[i].pressure = Math.round(Math.max(...validPressures) / 100)); // Keeps Math.max and conversion
          }
        }
      }
      this.data.status.forecast = SERVICE_STATUS_OK;
    } catch (e) {
      global.logError(`NWS: Error parsing forecast data: ${err.message}`);
      this.data.status.forecast = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = await _(`Error processing forecast data:\n`) + err.message;
    }
    return true;
  } 

  _getDayName(index) {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return dayNames[(new Date().getDay() + index) % 7];
  }

  _mapIcon(icon, isDaytime) {
    const icons = {
      day: {
        'skc': '32',              // (Fair/clear)                         (Sunny)
        'few': '34',              // (A few clouds)                       (Few clouds)
        'sct': '30',              // (Partly cloudy)                      (Partly cloudy)
        'bkn': '28',              // (Mostly cloudy)                      (Mostly cloudy)
        'ovc': '26d',             // (Overcast)                           (Overcast)
        'wind_skc': '32',         // (Fair/clear and windy)               (Sunny/Clear)
        'wind_few': '34',         // (A few clouds and windy)             (Few clouds)
        'wind_sct': '30',         // (Partly cloudy and windy)            (Partly cloudy)
        'wind_bkn': '28',         // (Mostly cloudy and windy)            (Mostly cloudy)
        'wind_ovc': '26d',        // (Overcast and windy)                 (Overcast)
        'snow': '14',             // (Snow)                               (Snow)
        'rain_snow': '15',        // (Rain and snow)                      (Rain and snow)
        'rain_sleet': '06',       // (Rain and sleet)                     (Rain and sleet)
        'snow_sleet': '07',       // (Snow and sleet)                     (Snow and sleet)
        'fzra': '10',             // (Freezing rain)                      (Freezing rain)
        'rain_fzra': '10',        // (Rain/freezing rain)                 (Rain and freezing rain)
        'snow_fzra': '10',        // (Freezing rain/snow)                 (Snow and freezing rain)
        'sleet': '18',            // (Sleet)                              (Sleet)
        'rain': '11',             // (Rain)                               (Rain)
        'rain_showers': '12',     // (Rain showers (high cloud cover))    (Rain showers)
        'rain_showers_hi': '04',  // (Rain showers (low cloud cover))     (Rain showers)
        'tsra': '04',             // (Thunderstorm (high cloud cover))    (Thunderstorm)
        'tsra_sct': '04',         // (Thunderstorm (medium cloud cover))  (Thunderstorm)
        'tsra_hi': '04',          // (Thunderstorm (low cloud cover))     (Thunderstorm)
        'tornado': '00',          // (Tornado)                            (Tornado)
        'hurricane': '01',        // (Hurricane conditions)               (Hurricane)
        'tropical_storm': '01',   // (Tropical storm conditions)          (Tropical storm)
        'dust': '19',             // (Dust)                               (Dust)
        'smoke': '19',            // (Smoke)                              (Smoke)
        'haze': '22',             // (Haze)                               (Haze)
        'hot': '36',              // (Hot)                                (Hot)
        'cold': '25',             // (Cold)                               (Cold)
        'blizzard': '15',         // (Blizzard)                           (Blizzard)
        'fog': '20'               // (Fog/mist)                           (Fog)
      },
      night: {
        'skc': '31',        // Clear Sky
        'few': '33',        // Few clouds
        'sct': '29',        // Partly cloudy
        'bkn': '27',        // Mostly cloudy
        'wind_skc': '31',   // Clear Sky
        'wind_few': '33',   // Few clouds
        'wind_sct': '29',   // Partly cloudy
        'wind_bkn': '27',   // Mostly cloudy
        'haze': '21',       // Haze
      }
    };
    return isDaytime === false && icons.night[icon] 
      ? icons.night[icon] 
      : icons.day[icon] || 'na';
  }

  async _mapDescription(text) {
    const textMap = {
       //Sky Cover
        'Mostly Sunny'      : 'Mostly Sunny',
        'Partly Sunny'      : 'Partly Sunny',
        'Mostly Clear'      : 'Mostly Clear',
        'Increasing Clouds' : 'Increasing Clouds',
        'Becoming Cloudy'   : 'Becoming Cloudy',
        'Clearing'          : 'Clear',
        'Gradual Clearing'  : 'Gradual Clearing',
        'Clearing Late'     : 'Clearing Late',
        'Decreasing Clouds' : 'Decreasing Clouds',
        'Becoming Sunny'    : 'Becoming Sunny',   
      //Wind/Temperatures
        'Breezy'            : 'Breezy',
        'Very Windy'        : 'Very Windy',
        'Damaging Winds'    : 'Damaging Winds',
      //Obstructions
        'Blowing Dust'          : 'Blowing Dust',
        'Isolated Haze'         : 'Isolated Haze',
        'Isolated Smoke'        : 'Isolated Smoke',
        'Isolated Fog'          : 'Isolated Fog',
        'Isolated Freezing Fog' : 'Isolated Freezing Fog',
        'Isolated Frost'        : 'Isolated Frost',
        'Areas Haze'            : 'Areas Haze',
        'Areas Smoke'           : 'Areas Smoke',
        'Areas Fog'             : 'Areas Fog',
        'Areas Freezing Fog'    : 'Areas Freezing Fog',
        'Areas Frost'           : 'Areas Frost',
        'Patchy Haze'           : 'Patchy Haze',
        'Patchy Smoke'          : 'Patchy Smoke',
        'Patchy Fog'            : 'Patchy Fog',
        'Patchy Freezing Fog'   : 'Patchy Freezing Fog',
        'Patchy Frost'          : 'Patchy Frost',
        'Smoke'                 : 'Smoky',
        'Frost'                 : 'Frost',
        'Dense Freezing Fog'    : 'Dense Freezing Fog',
        'Dense Fog'             : 'Dense Fog',
        'Morning Frost'         : 'Morning Frost',
      //Tropical
        'Trop. Storm Conditions'                    : 'Tropical Storm Conditions',
        'Trop. Storm Conditions Possible'           : 'Tropical Storm Conditions Possible',
        'Trop. Storm Conditions Expected'           : 'Tropical Storm Conditions Expected',
        'Trop. Storm/Hurricane Conditions Possible' : 'Tropical Storm/Hurricane Conditions Possible',
        'Hurricane Conditions Possible'             : 'Hurricane Conditions Possible',
        'Hurricane Conditions Expected'             : 'Hurricane Conditions Expected',
        'Hurricane Conditions'                      : 'Hurricane Conditions',
        'Trop. Storm Conditions Expected'           : 'Tropical Storm Conditions Expected',
      //Precipitation
        'Isolated T-storms'               : 'Isolated Thunderstorms',
        'Slight Chance T-storms'          : 'Slight Chance Thunderstorms',
        'Scattered T-storms'              : 'Scattered Thunderstorms',
        'Areas T-storms'                  : 'Areas Thunderstorms',
        'Chance T-storms'                 : 'Chance Thunderstorms',
        'T-storms Likely'                 : 'Thunderstorms Likely',
        'T-storms'                        : 'Thunderstorm',
        'Severe T-storms'                 : 'Severe Thunderstorms',
        'Isolated Sprinkles'              : 'Isolated Sprinkles',
        'Isolated Rain'                   : 'Isolated Rain',
        'Isolated Showers'                : 'Isolated Showers',
        'Isolated Drizzle'                : 'Isolated Drizzle',
        'Scattered Sprinkles'             : 'Scattered Sprinkles',
        'Scattered Rain'                  : 'Scattered Rain',
        'Scattered Drizzle'               : 'Scattered Drizzle',
        'Slight Chance Sprinkles'         : 'Slight Chance Sprinkles',
        'Slight Chance Rain'              : 'Slight Chance Rain',
        'Slight Chance Showers'           : 'Slight Chance Showers',
        'Slight Chance Drizzle'           : 'Slight Chance Drizzle',
        'Areas Sprinkles'                 : 'Areas Sprinkles',
        'Areas Rain'                      : 'Areas Rain',
        'Areas Showers'                   : 'Areas Showers',
        'Areas Drizzle'                   : 'Areas Drizzle',
        'Chance Sprinkles'                : 'Chance Sprinkles',
        'Chance Rain'                     : 'Chance Rain',
        'Chance Showers'                  : 'Chance Showers',
        'Chance Drizzle'                  : 'Chance Drizzle',
        'Sprinkles Likely'                : 'Sprinkles Likely',
        'Rain Likely'                     : 'Rain Likely',
        'Showers Likely'                  : 'Showers Likely',
        'Drizzle Likely'                  : 'Drizzle Likely',
        'Sprinkles'                       : 'Sprinkles',
        'Slight Chance Light Snow'        : 'Slight Chance Light Snow',
        'Slight Chance Snow'              : 'Slight Chance Snow',
        'Slight Chance Flurries'          : 'Slight Chance Flurries',
        'Areas Light Snow'                : 'Areas Light Snow',
        'Areas Snow'                      : 'Areas Snow',
        'Areas Flurries'                  : 'Areas Flurries',
        'Chance Light Snow'               : 'Chance Light Snow',
        'Chance Snow'                     : 'Chance Snow',
        'Chance Flurries'                 : 'Chance Flurries',
        'Light Snow Likely'               : 'Light Snow Likely',
        'Snow Likely'                     : 'Snow Likely',
        'Flurries Likely'                 : 'Flurries Likely',
        'Flurries'                        : 'Flurries',
        'Chance Freezing Rain'            : 'Chance Freezing Rain',
        'Chance Freezing Drizzle'         : 'Chance Freezing Drizzle',
        'Slight Chance Freezing Rain'     : 'Slight Chance Freezing Rain',
        'Slight Chance Freezing Drizzle'  : 'Slight Chance Freezing Drizzle',
        'Areas Freezing Rain'             : 'Areas Freezing Rain',
        'Areas Freezing Drizzle'          : 'Areas Freezing Drizzle',
        'Freezing Rain Likely'            : 'Freezing Rain Likely',
        'Freezing Drizzle Likely'         : 'Freezing Drizzle Likely',
        'Freezing Rain'                   : 'Freezing Rain',
        'Freezing Drizzle'                : 'Freezing Drizzle',
        'Wintry Mix'                      : 'Wintry Mix',
        'Snow/Sleet'                      : 'Snow/Sleet',
        'Slight Chance Rain/Sleet'        : 'Slight Chance Rain/Sleet',
        'Slight Chance Drizzle/Sleet'     : 'Slight Chance Drizzle/Sleet',
        'Slight Chance Sprinkles/Sleet'   : 'Areas Rain/Sleet',
        'Areas Rain/Sleet'                : 'Areas Drizzle/Sleet',
        'Areas Drizzle/Sleet'             : 'Areas Drizzle/Sleet',
        'Areas Sprinkles/Sleet'           : 'Areas Sprinkles/Sleet',
        'Chance Rain/Sleet'               : 'Chance Rain/Sleet',
        'Chance Drizzle/Sleet'            : 'Chance Drizzle/Sleet',
        'Chance Sprinkles/Sleet'          : 'Chance Sprinkles/Sleet',
        'Rain/Sleet Likely'               : 'Rain/Sleet Likely',
        'Drizzle/Sleet Likely'            : 'Drizzle/Sleet Likely',
        'Sprinkles/Sleet Likely'          : 'Sprinkles/Sleet Likely',
        'Rain/Sleet'                      : 'Rain/Sleet',
        'Drizzle/Sleet'                   : 'Drizzle/Sleet',
        'Sprinkles/Sleet'                 : 'Sprinkles/Sleet',
        'Slight Chance Snow/Rain '        : 'Slight Chance Snow/Rain',
        'Slight Chance Snow/Drizzle'      : 'Slight Chance Snow/Drizzle',
        'Slight Chance Snow/Sprinkles'    : 'Slight Chance Snow/Sprinkles',
        'Slight Chance Flurries/Rain'     : 'Slight Chance Flurries/Rain',
        'Slight Chance Flurries/Drizzle'  : 'Slight Chance Flurries/Drizzle',
        'Slight Chance Flurries/Sprinkles': 'Slight Chance Flurries/Sprinkles',
        'Areas Snow/Rain'                 : 'Areas Snow/Rain',
        'Areas Snow/Drizzle'              : 'Areas Snow/Drizzle',
        'Areas Snow/Sprinkles'            : 'Areas Snow/Sprinkles',
        'Areas Flurries/Rain'             : 'Areas Flurries/Rain',
        'Areas Flurries/Drizzle'          : 'Areas Flurries/Drizzle',
        'Areas Flurries/Sprinkles'        : 'Areas Flurries/Sprinkles',
        'Chance Snow/Rain'                : 'Chance Snow/Rain',
        'Chance Snow/Drizzle'             : 'Chance Snow/Drizzle',
        'Chance Snow/Sprinkles'           : 'Chance Snow/Sprinkles',
        'Chance Flurries/Rain'            : 'Chance Flurries/Rain',
        'Chance Flurries/Drizzle'         : 'Chance Flurries/Drizzle',
        'Chance Flurries/Sprinkles'       : 'Chance Flurries/Sprinkles',
        'Snow/Rain Likely'                : 'Snow/Rain Likely',
        'Snow/Drizzle Likely'             : 'Snow/Drizzle Likely',
        'Snow/Sprinkles Likely'           : 'Snow/Sprinkles Likely',
        'Flurries/Rain Likely'            : 'Flurries/Rain Likely',
        'Flurries/Drizzle Likely'         : 'Flurries/Drizzle Likely',
        'Flurries/Sprinkles Likely'       : 'Flurries/Sprinkles Likely',
        'Snow/Rain'                       : 'Snow/Rain',
        'Snow/Drizzle'                    : 'Snow/Drizzle',
        'Snow/Sprinkles'                  : 'Snow/Sprinkles',
        'Flurries/Rain'                   : 'Flurries/Rain',
        'Flurries/Drizzle'                : 'Flurries/Drizzle',
        'Flurries/Sprinkles'              : 'Flurries/Sprinkles',
        // New texts return API
        'Chance Rain Smooters'            : 'Chance of Light Rain',
        'Chance Rain Showers'             : 'Chance of Rain Showers'
    };
    if (!text) return '';
    try {
      return (text in textMap) ? await _(textMap[text]) : await _(text);
    } catch (err) {
      global.logError(`NWS: Error translating description: ${err.message}`);  
      return (text in textMap) ? textMap[text] : text;
    }
  }

  async _tradutor(...texts) {
    if (texts.length > 1) {
      return Promise.all(texts.map(texts => this._tradutor(text)));
    }
    const text = texts[0];
    try {
      const addText = `!The Weather Conditions are: ${text}`;
      const lineBreak = '(1)';
      const cleanText = addText.replace(/\n/g, lineBreak);
      const query = encodeURIComponent(cleanText);
      const translate = await this._loadData(this._languageURL, 'translate', this._paramsTranslate(query));
      let textTranslate = translate[0][0][0].split(lineBreak).join('\n');
      let textTranslate1 = textTranslate.replace(/^!.*?:\s*/, '');
      let textTranslate2 = textTranslate1.toLowerCase();
      let textTranslate3 = textTranslate2.charAt(0).toUpperCase() + textTranslate2.slice(1);
      return textTranslate3;
    } catch (err) {
      global.logError(`NWS: Error translating "${text}": ${err.message}`);
      return text; // Fallback: return original text
    }
  }
}

async function _(str) {
    if (!str) return '';
    try {
      if (Gettext.dgettext(UUID, str) && Gettext.dgettext(UUID, str) !== str) return Gettext.dgettext(UUID, str);
      if (Gettext.dgettext('cinnamon', str) && Gettext.dgettext('cinnamon', str) !== str) return Gettext.dgettext('cinnamon', str); 
      if (currentDriverInstance) {
        return await currentDriverInstance._tradutor(str);
      }
      return str;
    } catch (e) {
      global.logError(`NWS: Error in translate for "${str}": ${e}`);
      return str;
    }
};

