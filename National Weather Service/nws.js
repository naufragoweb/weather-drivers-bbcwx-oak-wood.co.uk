// National Weather Service Driver JSON API 2.5.1

const UUID = 'bbcwx@oak-wood.co.uk';
const DESKLET_DIR = imports.ui.deskletManager.deskletMeta[UUID].path;
imports.searchPath.push(`${DESKLET_DIR}/drivers`);
const wxBase = imports.wxbase;
const GLib = imports.gi.GLib;
const Gettext = imports.gettext;

const SERVICE_STATUS_ERROR = wxBase.SERVICE_STATUS_ERROR;
const SERVICE_STATUS_OK = wxBase.SERVICE_STATUS_OK;
const SERVICE_STATUS_INIT = wxBase.SERVICE_STATUS_INIT;

const NWS_DRIVER_MAX_DAYS = 7; // Constant for the number of BBC days

Gettext.bindtextdomain(UUID, GLib.get_home_dir() + '/.local/share/locale');

function _(str) {
  return str ? Gettext.dgettext(UUID, str) || Gettext.dgettext('cinnamon', str) || str : '';
}

var Driver = class Driver extends wxBase.Driver {
  constructor(stationID, version) {
    
    super(stationID);
    this.maxDays = 7;
    this.version = version;
    
    this.capabilities.meta.country = false;
    this.capabilities.cc.feelslike = false;
    this.capabilities.cc.pressure_direction = false;
    this.capabilities.forecast.pressure = false;

    this.drivertype = 'nws';
    this.linkText = 'https://www.weather.gov/';
    this.linkURL = '';
    this.locationURL = '';
    this.baseURL = 'https://api.weather.gov/';
    this.linkIcon = { 
      file: 'nsw', 
      width: 120, 
      height: 51 
    };

    this.currentURL = '';
    this.forecastURL = '';
  }

  // Override _emptyData from wxbase.js to avoid race conditions
    // when initializing this.data.days.
    _emptyData() {
        // Initializes the metadata parts of this.data
        this.data.city = '';
        this.data.region = '';
        this.data.wgs84 = new Object();
        this.data.wgs84.lat = '';
        this.data.wgs84.lon = '';

        // Initializes the current conditions (cc) object
        this.data.cc = new Object();
        this.data.cc.has_temp = false;
        this.data.cc.humidity = '';
        this.data.cc.icon = '';
        this.data.cc.temperature = '';
        this.data.cc.visibility = '';
        this.data.cc.weathertext = '';
        this.data.cc.wind_direction = '';
        this.data.cc.wind_speed = '';

        // Constructs a new array and assigns it atomically.
        this.data.days = [];
        
        // Use the constant BBC_DRIVER_MAX_DAYS to ensure the array is always the correct size for BBC,
        // regardless of the value of this.maxDays during the call to super() in the constructor.
        // This ensures that the array is always the correct size, regardless of the original this.maxDays value in wxbase.
        for (let i = 0; i < NWS_DRIVER_MAX_DAYS; i++) {
            this.data.days[i] = {
                day: '',
                humidity: '',
                icon: '',
                maximum_temperature: '',
                minimum_temperature: '',
                weathertext: '',
                wind_direction: '',
                wind_speed: ''
            };
        }
    }


  async refreshData(deskletObj) {

    // reset the services object at the beginning of refreshData
    this.data.status = {};
    this.data.status.cc = SERVICE_STATUS_INIT;
    this.data.status.forecast = SERVICE_STATUS_INIT;
    this.data.status.meta = SERVICE_STATUS_INIT;
    this.data.status.lasterror = false;

    // Execute script synchronously
    try {

      this.userAgent = `(${UUID} ${this.version}; Contact: https://github.com/linuxmint/cinnamon-spices-desklets/issues)`;

      // Check user input for stationID
      if (!await this._verify_station()) {
        return this._showError(deskletObj, _('Invalid Station ID'));
      }

      // Fetch API for location (meta data) and links for other forecasts
      const meta = await this._load_meta();
      if (!meta) {
        return this._showError(deskletObj, _('Failed to get location metadata'));
      } 

      // Fetch URL for current conditions and 7 days forecasts
      if (!await this._parse_URLs(meta)) {
        return this._showError(deskletObj, _('Error fetching URLs current and forecast'));
      }

      const obsStationsID = await this._load_observationStations();
      if (!obsStationsID) {
        return this._showError(deskletObj, _('Failed to get observation stations ID'));
      } 

      // Fetch observation Station ID for current conditions API
      if (!await this._parse_obsStation(obsStationsID)) {
        return this._showError(deskletObj, _('Error fetching observation station ID'));
      }

      // Fetch current conditions
      const lastest = await this._load_lastest();
      if (!lastest) {
        return this._showError(deskletObj, _('Failed to get current conditions'));
      } 

      // Fetch forecast 1 hour data
      const forecast1h = await this._load_forecast1h();
      if (!forecast1h) {
        return this._showError(deskletObj, _('Failed to get hourly forecast data'));
      }

      // Fetch forecast 12 hours data
      const forecast12h = await this._load_forecast12h();
      if (!forecast12h) {
        return this._showError(deskletObj, _('Failed to get forecast 12 hours data'));
      }

      // Fetch forecast daily data
      const forecastDaily = await this._load_forecastDaily();
      if (!forecastDaily) {
        return this._showError(deskletObj, _('Failed to get forecast daily data'));
      }

      this._emptyData();

      // Load data in objects to display
      if (!await this._parse_data(meta, lastest, forecast1h, forecast12h, forecastDaily)) {
        return this._showError(deskletObj, _('Failed to process all data'));
      }

      this.linkURL = 'https://forecast.weather.gov/MapClick.php?textField1=' + this.data.wgs84.lat + '&textField2=' + this.data.wgs84.lon;

      // Display data in the desklet
      deskletObj.displayMeta();
      deskletObj.displayCurrent();
      deskletObj.displayForecast();

      return true;

    } catch (err) {
      global.logError(`National Weather Service: refreshData error: ${err.message}`);
      this._showError(deskletObj, _('An unexpected error occurred: %s').format(err.message));
    }
  }

   _params() {
    return {
      'units': 'si',
    };
  }

   async _verify_station() {
    if (!this.stationID || typeof this.stationID !== 'string') {
      this.data.status.meta = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('Station ID not defined');
      return false;
    }
    if (/^\-?\d+(\.\d+)?,\-?\d+(\.\d+)?$/.test(this.stationID)) {
      const [lat, lon] = this.stationID.split(',').map(v => parseFloat(v.trim()));
      this.latlon = [lat, lon];
    } 
    return true;
  }

  _getWeatherAsync(url, params = null) {
    return new Promise((resolve, reject) => {
      this._getWeather(url, (weather) => {
        if (weather) {
          resolve(weather);
        } else {
          const error = new Error(`Failed to retrieve data from ${url}. Response was empty or indicated failure.`);
          reject(error);
        }      
      }, params, this.userAgent); 
    });
  }

  async _load_meta() {
    let metaURL = `${this.baseURL}points/${this.latlon[0]},${this.latlon[1]}`;
    try {
      // Use the new async helper
      const weather = await this._getWeatherAsync(metaURL);
      if (weather) {
        const json = JSON.parse(weather);
        // Basic check for expected structure
        if (!json || !json.id || json.id.length === 0) {
          this.data.status.meta = SERVICE_STATUS_ERROR;
          this.data.status.lasterror = _('Invalid meta data response');
          return null;
        }
        this.data.status.meta = SERVICE_STATUS_OK;
        return json;
      }
    } catch (err) {
      global.logError(`National Weather Service: _load_meta error: ${err.message}`);
      this.data.status.meta = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('Error retrieving current data: %s').format(err.message);
      return null;
    }
  }

  async _load_observationStations() {
    try {
      // Use the new async helper
      const weather = await this._getWeatherAsync(this.observationURL);
      if (weather) {
        const json = JSON.parse(weather);
        // Basic check for expected structure
        if (!json || !json.type || json.type.length === 0) {
          this.data.status.cc = SERVICE_STATUS_ERROR;
          this.data.status.lasterror = _('Invalid observation stations response');
          return null;
        }
      return json;
      }
    } catch (err) {
      global.logError(`National Weather Service: Error retrieving _load_observationStations data: ${err.message}`);
      return null;
    }
  }

  async _load_lastest() {
    this.lastestURL = `${this.baseURL}/stations/${this.obsStationID}/observations/latest`
    try {
      // Use the new async helper
      const weather = await this._getWeatherAsync(this.lastestURL);
      if (weather) {
        const json = JSON.parse(weather);
        // Basic check for expected structure
        if (!json || !json.type || json.type.length === 0) {
          this.data.status.cc = SERVICE_STATUS_ERROR;
          this.data.status.lasterror = _('Invalid observation stations response');
          return null;
        }
      return json;
      }
    } catch (err) {
      global.logError(`National Weather Service: Error retrieving _load_observationStations data: ${err.message}`);
      return null;
    }
  }

  async _load_forecast1h() {
    try {
      let params = this._params();
      // Use the new async helper
      const weather = await this._getWeatherAsync(this.forecast1hURL, params);
      if (weather) {
        const json = JSON.parse(weather);
        // Basic check for expected structure
        if (!json || !json.type || json.type.length === 0) {
          this.data.status.cc = SERVICE_STATUS_ERROR;
          this.data.status.lasterror = _('Invalid forecast1h response');
          return null;
        }
      return json;
      }
    } catch (err) {
      global.logError(`National Weather Service: Error retrieving _load_forecast1h data: ${err.message}`);
      return null;
    }
  }

  async _load_forecast12h() {
    let params = this._params();
    try {
      // Use the new async helper
      const weather = await this._getWeatherAsync(this.forecast12hURL, params);
      if (weather) {
        const json = JSON.parse(weather);
        // Basic check for expected structure
        if (!json || !json.type || json.type.length === 0) {
          this.data.status.forecast = SERVICE_STATUS_ERROR;
          this.data.status.lasterror = _('Invalid forecast12h response');
          return null;
        }
      return json;
      }
    } catch (err) {
      global.logError(`National Weather Service: Error retrieving _load_forecast12h data: ${err.message}`);
      return null;
    }
  }

  async _load_forecastDaily() {
    try {
      // Use the new async helper
      const weather = await this._getWeatherAsync(this.forecastDailyURL);
      if (weather) {
        const json = JSON.parse(weather);
        // Basic check for expected structure
        if (!json || !json.type || json.type.length === 0) {
          this.data.status.forecast = SERVICE_STATUS_ERROR;
          this.data.status.lasterror = _('Invalid forecastDaily response');
          return null;
        }
      return json;
      }
    } catch (err) {
      global.logError(`National Weather Service: Error retrieving _load_forecast data: ${err.message}`);
      return null;
    }
  }

   async _parse_URLs(meta) {
    
    this.observationURL = meta.properties.observationStations;
    this.forecast1hURL = meta.properties.forecastHourly;
    this.forecast12hURL = meta.properties.forecast;
    this.forecastDailyURL = meta.properties.forecastGridData;
    return true;
  }

   async _parse_obsStation(obsStationsID) {
    
    this.obsStationID = obsStationsID.features[0].properties.stationIdentifier;
    return true;
  }

  async _parse_data(meta, lastest, forecast1h, forecast12h, forecastDaily) {
    if (!meta) {
      this.data.status.meta = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('Missing meta data');
      return false;
    }
    if (!lastest) {
      this.data.status.cc = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('Missing current data');
      return false;
    }
    if (!forecast1h) {
      this.data.status.forecast = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('Missing forecast1h data');
      return false;
    }
    if (!forecast12h) {
      this.data.status.forecast = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('Missing forecast12h data');
      return false;
    }
    if (!forecastDaily) {
      this.data.status.forecast = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('Missing forecastDaily data');
      return false;
    }

    try{

      // Meta data
      let location = meta.properties.relativeLocation;

      this.data.city = location.properties.city;
      this.data.region = location.properties.state;
      this.data.wgs84 = {
        lat: location.geometry.coordinates[1],
        lon: location.geometry.coordinates[0]
      };

      this.data.status.meta = SERVICE_STATUS_OK;

    } catch (e) {
      global.logError(e);
      this.data.status.meta = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('Incomplete location metadata');
      return false;
    }

    const isDaytime = forecast1h.properties.periods[0].isDaytime === true;
    
    // Current data
    try {
      let current = lastest.properties;
      let current1h = forecast1h.properties.periods[0];

      this.data.cc.temperature = current.temperature.value ?? current1h.temperature ?? '';
      this.data.cc.humidity = current.relativeHumidity.value ?? current1h.relativeHumidity ?? '';
      this.data.cc.pressure = Math.round(current.barometricPressure.value / 100) ?? '';
      this.data.cc.wind_speed = current.windSpeed.value ?? (current1h.windSpeed.match(/\d+/)[0] ?? null) ?? '';
      this.data.cc.wind_direction = this.compassDirection(current.windDirection.value) ?? current1h.windDirection ?? '';
      this.data.cc.visibility = Math.round(current.visibility.value / 1000) ?? '';
      this.data.cc.icon = this.mapicon((current.icon || current1h.icon).split('?')[0].split('/').pop().split(',')[0], isDaytime);  // extract from icon URL
      this.data.cc.weathertext = this._mapDescription((current.textDescription || current1h.shortForecast), isDaytime);  // extract from icon URL;
      this.data.cc.has_temp = true;
      
      this.data.status.cc = SERVICE_STATUS_OK;

    } catch (e) {
      global.logError(e);
      this.data.status.cc = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('Incomplete current data');
      return false;
    }

    // Forecast data
    try {
      const periods12h = forecast12h.properties.periods;
      const dailyProps = forecastDaily.properties;
      // A variável `isDaytime` é definida antes deste bloco try/catch no código original,
      // referindo-se a `forecast1h.properties.periods[0].isDaytime`.

      // DAY 0
      const period0 = periods12h[0];
      this.data.days[0].day = this._getDayName(0);
      this.data.days[0].icon = this.mapicon(period0.icon.split('?')[0].split('/').pop().split(',')[0], isDaytime);
      this.data.days[0].weathertext = this._mapDescription(period0.shortForecast, isDaytime);
      this.data.days[0].wind_speed = Number(period0.windSpeed.match(/\d+/)[0]) ?? '';
      this.data.days[0].wind_direction = period0.windDirection ?? '';
      this.data.days[0].maximum_temperature = dailyProps.maxTemperature.values[0].value ?? '';
      this.data.days[0].minimum_temperature = dailyProps.minTemperature.values[0].value ?? '';
      this.data.days[0].humidity = dailyProps.relativeHumidity.values[0].value ?? '';
      //this.data.days[0].pressure = Math.round(dailyProps.pressure.values[0].value / 100);

      // Agrupa valores de forecastDaily por diaOffset (1-6)
      const dailyAggregatedValues = {}; // Chave: dayOffset, Valor: { maxTemps: [], minTemps: [], humidities: [], pressuresPa: [] }

      const getDayOffsetFromTimestamp = (timeStr) => {
        const entryDate = new Date(timeStr.split('/')[0]);
        const entryDayStart = new Date(entryDate.getUTCFullYear(), entryDate.getUTCMonth(), entryDate.getUTCDate());
        // Usar a data local do primeiro período como base para o offset
        const baseDateForOffset = new Date(periods12h[0].startTime);
        const baseDayStart = new Date(baseDateForOffset.getUTCFullYear(), baseDateForOffset.getUTCMonth(), baseDateForOffset.getUTCDate());
        return Math.round((entryDayStart - baseDayStart) / (1000 * 60 * 60 * 24));
      };

      ['maxTemperature', 'minTemperature', 'relativeHumidity', 'pressure'].forEach(propName => {
        if (!dailyProps[propName] || !dailyProps[propName].values) return;
        dailyProps[propName].values.forEach(entry => {
          const dayOffset = getDayOffsetFromTimestamp(entry.validTime);
          if (dayOffset >= 1 && dayOffset < this.maxDays) {
            if (!dailyAggregatedValues[dayOffset]) {
              dailyAggregatedValues[dayOffset] = { maxTemps: [], minTemps: [], humidities: [], pressuresPa: [] };
            }
            if (propName === 'maxTemperature') dailyAggregatedValues[dayOffset].maxTemps.push(entry.value);
            if (propName === 'minTemperature') dailyAggregatedValues[dayOffset].minTemps.push(entry.value);
            if (propName === 'relativeHumidity') dailyAggregatedValues[dayOffset].humidities.push(entry.value);
            if (propName === 'pressure') dailyAggregatedValues[dayOffset].pressuresPa.push(entry.value);
          }
        });
      });

      for (let i = 1; i < this.maxDays; i++) {
        this.data.days[i].day = this._getDayName(i);

        // Dados de forecast12h (período diurno às 06:00 para o dia i)
        // Calcular a data alvo (targetDayKey) para o dia 'i' com base na data local do primeiro período.
        const dateOfPeriod0Local = new Date(periods12h[0].startTime);
        const targetLocalDate = new Date(dateOfPeriod0Local);
        targetLocalDate.setDate(dateOfPeriod0Local.getDate() + i);
        
        const targetYear = targetLocalDate.getFullYear();
        const targetMonth = ('0' + (targetLocalDate.getMonth() + 1)).slice(-2);
        const targetDay = ('0' + targetLocalDate.getDate()).slice(-2);
        const targetDayKey = `${targetYear}-${targetMonth}-${targetDay}`; // Formato YYYY-MM-DD

        const periodForDay = periods12h.find(p => {
          // Garantir que startTime existe e isDaytime é um booleano
          if (!p.startTime || typeof p.isDaytime !== 'boolean') {
            return false;
          }
          const pStartTimeString = p.startTime; // ex: "2024-03-18T06:00:00-07:00"
          const periodLocalDayString = pStartTimeString.substring(0, 10); // ex: "2024-03-18"
          const periodLocalHourString = pStartTimeString.substring(11, 13); // ex: "06"

          return periodLocalDayString === targetDayKey && periodLocalHourString === "06";
                 p.isDaytime === true; // Queremos o período diurno que começa às 06:00
        });

        if (periodForDay) {
          this.data.days[i].icon = this.mapicon(periodForDay.icon.split('?')[0].split('/').pop().split(',')[0], true); // true para isDaytime (06:00)
          this.data.days[i].weathertext = this._mapDescription(periodForDay.shortForecast, true);
          this.data.days[i].wind_speed = Number(periodForDay.windSpeed.match(/\d+/)[0]);
          this.data.days[i].wind_direction = periodForDay.windDirection;
        }

        // Dados de forecastDaily agregados para o dia i
        const aggregated = dailyAggregatedValues[i];
        if (aggregated) {
          if (aggregated.maxTemps.length) this.data.days[i].maximum_temperature = Math.max(...aggregated.maxTemps);
          if (aggregated.minTemps.length) this.data.days[i].minimum_temperature = Math.min(...aggregated.minTemps);
          if (aggregated.humidities.length) this.data.days[i].humidity = Math.max(...aggregated.humidities);
          
          const validPressures = aggregated.pressuresPa.filter(val => typeof val === 'number' && val !== null);
          if (validPressures.length > 0) {
            this.data.days[i].pressure = Math.round(Math.max(...validPressures) / 100);
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

  mapicon(icon, isDaytime) {
    
    const icons = {
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
    };

    const nightIcons = {
      'skc': '31',        // Clear Sky
      'few': '33',        // Few clouds
      'sct': '29',        // Partly cloudy
      'bkn': '27',        // Mostly cloudy
      'wind_skc': '31',   // Clear Sky
      'wind_few': '33',   // Few clouds
      'wind_sct': '29',   // Partly cloudy
      'wind_bkn': '27',   // Mostly cloudy
      'haze': '21',       // Haze
    };

    let iconCode = 'na';
    const iconKey = icon ? icon.toString() : '';

    if (icon && (typeof icons[icon] !== 'undefined')) {
    iconCode = icons[icon];
    }

    if (!isDaytime && (typeof nightIcons[icon] !== 'undefined')) {
    iconCode = nightIcons[icon];
    }
    return iconCode;
  }

    _mapDescription(text, isDay = 1) {
      if (!text) return '';
      const textmap = {
        '0': isDay ? _('Sunny') : _('Clear Sky'),     // Clear sky
        '1': _('Mainly Clear')                        // Mainly clear
    };

    if (typeof textmap[text] !== 'undefined') {
      return textmap[text]; // Return the specifically translated version
    }
    return _(text); // Return the generally translated version
  }


};