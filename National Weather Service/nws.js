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
const _ = str => str ? Gettext.dgettext(UUID, str) || Gettext.dgettext('cinnamon', str) || str : '';

var Driver = class Driver extends wxBase.Driver {
  constructor(stationID, version) {
    super(stationID);
    this.maxDays = MAX_DAYS;
    this.version = version;

    this.capabilities.meta.country = false;
    this.capabilities.cc.feelslike = false;
    this.capabilities.cc.pressure_direction = false;
    this.capabilities.forecast.pressure = false;
    
    this.drivertype = 'nws';
    this.linkText = 'https://www.weather.gov/';
    this.linkURL = 'https://forecast.weather.gov/';
    this.baseURL = 'https://api.weather.gov/';
    this.linkIcon = { file: 'nws', width: 50, height: 50 };

    this.userAgent = `(${UUID} ${this.version}; Contact: https://github.com/linuxmint/cinnamon-spices-desklets/issues)`;
    
    this.locationURL = '';
  }

  _emptyData() {
    this.data = {
      city: '',
      region: '',
      wgs84: { lat: '', lon: '' },
      cc: {
        has_temp: '', humidity: '', icon: '', temperature: '',
        visibility: '', weathertext: '', wind_direction: '', wind_speed: ''
      },
      days: Array(MAX_DAYS).fill().map(() => ({
        day: '', humidity: '', icon: '', maximum_temperature: '',
        minimum_temperature: '', weathertext: '', wind_direction: '', wind_speed: ''
      })),
      status: {}
    };
  }

  async refreshData(deskletObj) {
    
    if (!await this._verifyStation()) {
      this._showError(deskletObj, _(this.data.status.lasterror));
      return;
    }
    try {

      this.data.status = {
        cc: SERVICE_STATUS_INIT,
        forecast: SERVICE_STATUS_INIT,
        meta: SERVICE_STATUS_INIT,
        lasterror: false
      };

      let metaURL = `${this.baseURL}points/${this.latlon[0]},${this.latlon[1]}`;
      const meta = await this._loadData(metaURL, 'meta');
      if (!meta) return this._showError(deskletObj, _('Failed to get location metadata'));
      await this._parseURLs(meta);
      

      const obsStationsID = await this._loadData(this.observationURL, 'observation stations');
      if (!obsStationsID) return this._showError(deskletObj, _('Failed to get observation stations ID'));
      await this._parseObsStation(obsStationsID);

      let params = this._params();

      let lastestURL =`${this.baseURL}/stations/${this.obsStationID}/observations/latest`;
      const [lastest, forecast1h, forecast12h, forecastDaily] = await Promise.all([
        this._loadData(lastestURL, 'lastest'),
        this._loadDataWithParams(this.forecast1hURL, 'forecast 1h', params),
        this._loadDataWithParams(this.forecast12hURL, 'forecast 12h', params),
        this._loadData(this.forecastDailyURL, 'forecast daily')
      ]);

      if (!lastest || !forecast1h || !forecast12h || !forecastDaily) {
        return this._showError(deskletObj, _('Failed to load some weather data'));
      }

      this._emptyData();
      
      // Data process
      await Promise.all([
        this._parseMetaData(meta),
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

  async _verifyStation() {
    if (!this.stationID || typeof this.stationID !== 'string' || this.stationID.trim() === "") {
      this._emptyData();
      this.data.status.meta = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('Location\nis empty or not defined.');
      this.latlon = [];
      
      return false;
    }
   // Regex to strictly match the format "lat,lon", allowing spaces around the comma.
    const latLon = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;
    const match = this.stationID.match(latLon);

    if (!match) {
      this._emptyData();
      this.data.status.meta = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('Invalid Location format.\nExpected: latitude,longitude\n(e.g., 40.71,-74.01)');
      this.latlon = null;
      return false;
    }

    const lat = parseFloat(match[1]);
    const lon = parseFloat(match[2]);

    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      this._emptyData();
      this.data.status.meta = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('Invalid latitude or longitude\nvalues in Location.');
      this.latlon = null;
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

  async _loadData(URL, API) {
    try {
      const rawData = await this._getWeatherAsync(URL);
      const json = JSON.parse(rawData);
      return json ? json : false;
    } catch (err) {
      global.logError(`NWS: Error loading data ${API}: ${err.message}`);
      return false;
    }
  }  

  async _loadDataWithParams(URL, API, params) {
    try {
      const rawData = await this._getWeatherAsync(URL, params);
      const json = JSON.parse(rawData);
      return json ? json : false;
    } catch (err) {
      global.logError(`NWS: Error loading data ${API}: ${err.message}`);
      return false;
    }
  }  

  async _parseURLs(meta) {
    this.observationURL = meta.properties.observationStations;
    this.forecast1hURL = meta.properties.forecastHourly;
    this.forecast12hURL = meta.properties.forecast;
    this.forecastDailyURL = meta.properties.forecastGridData;
    return true;
  }

  async _parseObsStation(obsStationsID) {
    this.obsStationID = obsStationsID.features[0].properties.stationIdentifier;
    return true;
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
      global.logError(`Error parsing meta data: ${err.message}`);
      this.data.status.meta = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('Error processing meta data');
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
        weathertext: this._mapDescription(current.textDescription ?? current1h.shortForecast, isDaytime),
        has_temp: true
      });
      
      this.data.status.cc = SERVICE_STATUS_OK;
    } catch (err) {
      global.logError(`Error parsing current data: ${err.message}`);
      this.data.status.cc = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('Error processing current conditions');
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
        weathertext: this._mapDescription(period0.shortForecast, isDaytime),
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
          weathertext: this._mapDescription(periodForDay.shortForecast, true),
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
      global.logError(e);
      this.data.status.forecast = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('Incomplete forecast data: %s').format(e.message);
      return false;
    }
    return true;
  } 

  _getDayName(index) {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return dayNames[(new Date().getDay() + index) % 7];
  }

  _mapIcon(icon, isDaytime) {
    const iconMappings = {
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
    return !isDaytime && iconMappings.night[icon] 
      ? iconMappings.night[icon] 
      : iconMappings.day[icon] || 'na';
  }

  _mapDescription(text, isDay = true) {
    const textMappings = {
      //Sky Cover
        'Mostly Sunny': '',
        'Partly Sunny': '',
        'Mostly Clear': '',
        'Increasing Clouds': '',
        'Becoming Cloudy': '',
        'Clearing': '',
        'Gradual Clearing': '',
        'Clearing Late': '',
        'Decreasing Clouds': '',
        'Becoming Sunny': '',   
      //Wind/Temperatures
        'Breezy': '',
        'Very Windy': '',
        'Damaging Winds': '',
      //Obstructions
        'Blowing Dust': '',
        'Isolated Haze': '',
        'Isolated Smoke': '',
        'Isolated Fog': '',
        'Isolated Freezing Fog': '',
        'Isolated Frost': '',
        'Areas Haze': '',
        'Areas Smoke': '',
        'Areas Fog': '',
        'Areas Freezing Fog': '',
        'Areas Frost': '',
        'Patchy Haze': '',
        'Patchy Smoke': '',
        'Patchy Fog': '',
        'Patchy Freezing Fog': '',
        'Patchy Frost': '',
        'Smoke': 'Smoky',
        'Frost': '',
        'Dense Freezing Fog': '',
        'Dense Fog': '',
        'Morning Frost': '',
      //Tropical
        'Trop. Storm Conditions': _('Tropical Storm'),
        'Trop. Storm Conditions Possible': '',
        'Trop. Storm Conditions Expected': '',
        'Trop. Storm/Hurricane Conditions Possible': '',
        'Hurricane Conditions Possible': '',
        'Hurricane Conditions Expected': '',
        'Hurricane Conditions': 'Hurricane',
        'Trop. Storm Conditions Expected': '',
      //Precipitation
        'Isolated T-storms': _('Isolated Thunderstorms'),
        'Slight Chance T-storms': '',
        'Scattered T-storms': _('Scattered Thunderstorms'),
        'Areas T-storms': '',
        'Chance T-storms': '',
        'T-storms Likely': '',
        'T-storms': _('Thunderstorm'),
        'Severe T-storms': _('Severe Thunderstorms'),
        'Isolated Sprinkles': '',
        'Isolated Rain': '',
        'Isolated Showers': '',
        'Isolated Drizzle': '',
        'Scattered Sprinkles': '',
        'Scattered Rain': '',
        'Scattered Drizzle': '',
        'Slight Chance Sprinkles':'',
        'Slight Chance Rain': '',
        'Slight Chance Showers': '',
        'Slight Chance Drizzle': '',
        'Areas Sprinkles': '',
        'Areas Rain': '',
        'Areas Showers': '',
        'Areas Drizzle': '',
        'Chance Sprinkles': '',
        'Chance Rain': '',
        'Chance Showers': '',
        'Chance Drizzle': '',
        'Sprinkles Likely': '',
        'Rain Likely': '',
        'Showers Likely': '',
        'Drizzle Likely': '',
        'Sprinkles': '',
        'Slight Chance Light Snow': '',
        'Slight Chance Snow': '',
        'Slight Chance Flurries': '',
        'Areas Light Snow': '',
        'Areas Snow': '',
        'Areas Flurries': '',
        'Chance Light Snow': '',
        'Chance Snow': '',
        'Chance Flurries': '',
        'Light Snow Likely': '',
        'Snow Likely': '',
        'Flurries Likely': '',
        'Flurries': '',
        'Chance Freezing Rain': '',
        'Chance Freezing Drizzle': '',
        'Slight Chance Freezing Rain ': '',
        'Slight Chance Freezing Drizzle': '',
        'Areas Freezing Rain': '',
        'Areas Freezing Drizzle': '',
        'Freezing Rain Likely': '',
        'Freezing Drizzle Likely': '',
        'Freezing Rain': '',
        'Freezing Drizzle': '',
        'Wintry Mix': '',
        'Snow/Sleet': '',
        'Slight Chance Rain/Sleet': '',
        'Slight Chance Drizzle/Sleet': '',
        'Slight Chance Sprinkles/Sleet': '',
        'Areas Rain/Sleet': '',
        'Areas Drizzle/Sleet': '',
        'Areas Sprinkles/Sleet': '',
        'Chance Rain/Sleet': '',
        'Chance Drizzle/Sleet': '',
        'Chance Sprinkles/Sleet': '',
        'Rain/Sleet Likely': '',
        'Drizzle/Sleet Likely': '',
        'Sprinkles/Sleet Likely': '',
        'Rain/Sleet': '',
        'Drizzle/Sleet': '',
        'Sprinkles/Sleet': '',
        'Slight Chance Snow/Rain ': '',
        'Slight Chance Snow/Drizzle': '',
        'Slight Chance Snow/Sprinkles': '',
        'Slight Chance Flurries/Rain': '',
        'Slight Chance Flurries/Drizzle': '',
        'Slight Chance Flurries/Sprinkles': '',
        'Areas Snow/Rain': '',
        'Areas Snow/Drizzle': '',
        'Areas Snow/Sprinkles': '',
        'Areas Flurries/Rain': '',
        'Areas Flurries/Drizzle': '',
        'Areas Flurries/Sprinkles': '',
        'Chance Snow/Rain': '',
        'Chance Snow/Drizzle': '',
        'Chance Snow/Sprinkles': '',
        'Chance Flurries/Rain': '',
        'Chance Flurries/Drizzle': '',
        'Chance Flurries/Sprinkles': '',
        'Snow/Rain Likely': '',
        'Snow/Drizzle Likely': '',
        'Snow/Sprinkles Likely': '',
        'Flurries/Rain Likely': '',
        'Flurries/Drizzle Likely': '',
        'Flurries/Sprinkles Likely': '',
        'Snow/Rain': '',
        'Snow/Drizzle': '',
        'Snow/Sprinkles': '',
        'Flurries/Rain': '',
        'Flurries/Drizzle': '',
        'Flurries/Sprinkles': ''
    };
    if (!text) return '';
    return textMappings[text]?.(isDay) || _(text);
  }
};