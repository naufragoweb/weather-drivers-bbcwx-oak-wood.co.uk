// Google Weather API
// Created using ECMAScript 6 standart

const UUID = 'bbcwx@oak-wood.co.uk';
const DESKLET_DIR = imports.ui.deskletManager.deskletMeta[UUID].path;
imports.searchPath.push(`${DESKLET_DIR}/drivers`);
const wxBase = imports.wxbase;
const GLib = imports.gi.GLib;
const Gettext = imports.gettext;

const { SERVICE_STATUS_ERROR, SERVICE_STATUS_OK, SERVICE_STATUS_INIT } = wxBase;
const MAX_DAYS = 7;

Gettext.bindtextdomain(UUID, GLib.get_home_dir() + '/.local/share/locale');

var currentDriverInstance = null;

var Driver = class Driver extends wxBase.Driver {
  constructor(stationID, apikey, version) {
    super(stationID, apikey);
    this.version = version;
    currentDriverInstance = this;

    this.capabilities.forecast.pressure = false;
    
    this.drivertype = 'Google';
    this.maxDays = MAX_DAYS;
    this.linkText = 'Google Weather';
    this.linkURL = 'https://www.google.com/search?q=Weather in ';
    this._baseURL = `https://weather.googleapis.com/v1`;
    this._locationURL = `https://nominatim.openstreetmap.org/reverse`;
    this.userAgent = `(${UUID} ${this.version}; Contact: https://github.com/linuxmint/cinnamon-spices-desklets/issues)`;
    this._languageURL = `https://translate.googleapis.com/translate_a/single`;
    this.linkIcon = {file: 'google', width: 50, height: 50};

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
    
    this.latlon = [];
  }

  _emptyData() {
    this.data = {
      city: '', 
      country: '', 
      region: '',
      wgs84: { lat: '', lon: '' },
      cc: {
        feelslike: '', 
        has_temp: false, 
        humidity: '', 
        icon: '', 
        pressure: '',
        temperature: '', 
        weathertext: '', 
        wind_direction: '', 
        wind_speed: '', 
        visibility: ''
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
      };

      let currentURL = `${this._baseURL}/currentConditions:lookup`;
      let forecastURL = `${this._baseURL}/forecast/days:lookup`;
      const [meta, current, forecast] = await Promise.all([
        this._loadData(this._locationURL, 'meta', this._paramsGeocode()),
        this._loadData(currentURL, 'current', this._paramsGoogle()),
        this._loadData(forecastURL, 'forecast', {...this._paramsGoogle(), days: '7', pageSize: '7'}) 
      ]);

      this._emptyData();

      await Promise.all([
        this._parseMetaData(meta),
        this._parseCurrentData(current),
        this._parseForecastData(current, forecast)
      ]);

      this.linkURL = `${this.linkURL}${this.data.city}`;

      deskletObj.displayMeta();
      deskletObj.displayCurrent();
      deskletObj.displayForecast();

      return true;
    } catch (err) {
      global.logError(`Google Weather: error: ${err.message}`);
      this._showError(deskletObj, await _('An unexpected error occurred:\n') + err.message);
    }
  }

  _paramsGoogle() {
    return {
      key: this.apikey,
      'location.latitude': this.latlon[0],
      'location.longitude': this.latlon[1],
      languageCode: this.getLangCode(),
      unitsSystem: 'metric'
    };
  }
  
  _paramsGeocode() {
    return {
      lat: this.latlon[0],
      lon: this.latlon[1],
      format: 'json'
    };
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
    if (!this.apikey) {
      this._emptyData();
      this.data.status.meta = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = 'API key\nis empty or not defined.';
      this.latlon = [];     
      return false;
    }

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
      this.latlon = null;
      return false;
    }

    const lat = parseFloat(match[1]);
    const lon = parseFloat(match[2]);

    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      this._emptyData();
      this.data.status.meta = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = 'Invalid values\nof latitude or longitude.';
      this.latlon = null;
      return false;
    }
    this.latlon = [lat, lon];
    return true;
  }

  _getWeatherAsync(url, params = null) {
    return new Promise((resolve, reject) => {
      this._getWeather(url, weather => 
        weather ? resolve(weather) : reject(new Error (`Failed to retrieve data from ${url}`))
      , params, this.userAgent);
    });
  }

  async _loadDataWithParams(URL, API, params) {
    try {
      const rawData = await this._getWeatherAsync(URL, params);
      const json = JSON.parse(rawData);
      if (URL.includes(this._locationURL)) return json.type ? json : false;
      if (URL.includes(this._baseURL)) return json.timeZone ? json : false;
      if (URL.includes(this._languageURL)) return json[0] ? json : false;
    } catch (err) {
      global.logError(`Google Weather: Error loading data ${API}: ${err.message}`);
      return false;
    }
  }

  async _parseMetaData(meta) {
    try {
      Object.assign(this.data, {
        city: meta.address.city,
        country: meta.address.country,
        wgs84: {lat: this.latlon[0], lon: this.latlon[1]},
      });
      this.data.status.meta = SERVICE_STATUS_OK;
    } catch (err) {
      global.logError(`Error parsing meta data: ${err.message}`);
      this.data.status.meta = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = await _(`Error processing location data:\n`) + err.message;
    }
    return true;
  }

  async _parseCurrentData(current) {
    try {
      const isDaytime = current.isDaytime;

      Object.assign(this.data.cc, {
        temperature: current.temperature.degrees,
        feelslike: current.feelsLikeTemperature.degrees,
        wind_speed: current.wind.speed.value,
        wind_direction: this.compassDirection(current.wind.direction.degrees),
        humidity: current.relativeHumidity,
        pressure: parseInt(current.airPressure.meanSeaLevelMillibars),
        visibility: current.visibility.distance,
        weathertext: current.weatherCondition.description.text,
        icon: this._mapIcon(current.weatherCondition.type, isDaytime),
        has_temp: true,
      });
      this.data.status.cc = SERVICE_STATUS_OK;
    } catch (err) {
      global.logError(`Error parsing current data: ${err.message}`);
      this.data.status.cc = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = await _(`Error processing current data:\n`) + err.message;
    }
    return true;
  }

  async _parseForecastData(current, forecast) {
    try {
      const isDaytime = current.isDaytime;
      const forecasts = forecast.forecastDays;

      for (let i = 0; i < forecasts.length; i++) {
        let dayorNightForecast = (i === 0 && isDaytime === false) ? forecasts[i].nighttimeForecast : forecasts[i].daytimeForecast;

        Object.assign(this.data.days[i], {
          day: this._getDayName(i),
          maximum_temperature: forecasts[i].maxTemperature.degrees,
          minimum_temperature: forecasts[i].minTemperature.degrees,
          wind_speed: dayorNightForecast.wind.speed.value,
          wind_direction: this.compassDirection(dayorNightForecast.wind.direction.degrees),
          weathertext: dayorNightForecast.weatherCondition.description.text,
          icon: this._mapIcon(dayorNightForecast.weatherCondition.type, i === 0 ? isDaytime : true),
          humidity: dayorNightForecast.relativeHumidity
        });
      }
      this.data.status.forecast = SERVICE_STATUS_OK;
    } catch (err) {
      global.logError(`Error parsing forecast data: ${err.message}`);
      this.data.status.cc = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = await _(`Error processing forecast data:\n`) + err.message;
    }
    return true;
  }

  _getDayName(index) {
    // Use the abbreviations that correspond to the keys in desklet.js's this.daynames
    const dayNamesAbbr = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date();
    const currentDay = today.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
    const dayIndex = (currentDay + index) % 7;
    return dayNamesAbbr[dayIndex]; // Returns the day abbreviation
  }

  _mapIcon(icon, isDaytime) {
    
    const icons = {
      day: {
      // Confirmed in APIs
      'CHANCE_OF_SHOWERS'       : '09',  // Chance of intermittent rain (Drizzle)
      'CLEAR'                   : '32',  // No clouds (Sunny)
      'CLOUDY'                  : '26',  // All clouds (White cloud)
      'HEAVY_RAIN'              : '12',  // Heavy rain (Heavy rain)
      'HEAVY_THUNDERSTORM'      : '37',  // Heavy thunderstorm (Thundery showers)
      'LIGHT_RAIN'              : '09',  // Light rain (Drizzle)
      'LIGHT_SNOW'              : '13',  // Light snow (Light snow)
      'MOSTLY_CLEAR'            : '34',  // Periodic clouds (Few clouds)
      'MOSTLY_CLOUDY'           : '28',  // More clouds than sun (Mostly cloudy)
      'PARTLY_CLOUDY'           : '30',  // Some clouds (Partly cloudy)
      'RAIN'                    : '11',  // Moderate rain (Light rain)
      'RAIN_AND_SNOW'           : '05',  // Rain and snow mix (Mixed rain and snow)
      'RAIN_SHOWERS'            : '39',  // Showers are considered to be rainfall that has a shorter duration than rain, (Showers)
      'SCATTERED_SHOWERS'       : '11',  // Intermittent rain (Light rain)
      'SCATTERED_THUNDERSTORMS' : '38',  // Thunderstorms that has rain in various intensities for brief periods of time (Scattered thunderstorms)
      'SNOW'                    : '14',  // Moderate snow (Medium snow)
      'SNOW_SHOWERS'            : '41',  // Snow showers (Snow showers)
      'THUNDERSTORM'            : '04',  // Thunderstorm (Thunderstorms)
      'WINDY'                   : '24',  // High wind (Windy)

      // Not confirmed
      'BLOWING_SNOW'            : '15',  // Snow with intense wind (Blowing snow)
      'CHANCE_OF_SNOW_SHOWERS'  : '13',  // Chance of snow showers (Light snow)
      'HAIL'                    : '18',  // Hail (Hail/Sleet)
      'HAIL_SHOWERS'            : '18',  // Hail that is falling at varying intensities for brief periods of time (Hail/Sleet)
      'HEAVY_RAIN_SHOWERS'      : '12',  // Intense showers (Heavy rain)
      'HEAVY_SNOW'              : '16',  // Heavy snow (Heavy snow)
      'HEAVY_SNOW_SHOWERS'      : '41',  // Heavy show showers (Heavy snow)
      'HEAVY_SNOW_STORM'        : '16',  // Heavy snow with possible thunder and lightning (Heavy snow)
      'LIGHT_RAIN_SHOWERS'      : '09',  // Light intermittent rain (Drizzle)
      'LIGHT_SNOW_SHOWERS'      : '13',  // Light snow that is falling at varying intensities for brief periods of time (Light snow)
      'LIGHT_THUNDERSTORM_RAIN' : '37',  // Light thunderstorm rain (Thundery showers)
      'LIGHT_TO_MODERATE_RAIN'  : '12',  // Rain (light to moderate in quantity) (Heavy rain)
      'LIGHT_TO_MODERATE_SNOW'  : '13',  // Light to moderate snow (Light snow)
      'MODERATE_TO_HEAVY_RAIN'  : '12',  // Rain (moderate to heavy in quantity) (Heavy rain)
      'MODERATE_TO_HEAVY_SNOW'  : '16',  // Moderate to heavy snow (Heavy snow)
      'RAIN_PERIODICALLY_HEAVY' : '12',  // Rain periodically heavy (Heavy rain)
      'SCATTERED_SNOW_SHOWERS'  : '14',  // Snow that is falling at varying intensities for brief periods of time (Medium snow)
      'SNOWSTORM'               : '14',  // Snow with possible thunder and lightning (Medium snow)
      'SNOW_PERIODICALLY_HEAVY' : '16',  // Snow, at times heavy (Heavy snow)
      'THUNDERSHOWER'           : '37',  // A shower of rain accompanied by thunder and lightning (Thundery showers)
      'WIND_AND_RAIN'           : '12',  // High wind with precipitation (Heavy rain)
      'TYPE_UNSPECIFIED'        : 'na'   // Unknown
    },

    night: {
      'CLEAR'                   : '31',  // Clear Sky
      'HEAVY_SNOW_SHOWERS'      : '46',  // Show showers
      'HEAVY_THUNDERSTORM'      : '47',  // Heavy thunderstorm (Thundery showers)
      'LIGHT_THUNDERSTORM_RAIN' : '47',  // Thundery showers
      'MOSTLY_CLEAR'            : '33',  // Few clouds
      'MOSTLY_CLOUDY'           : '27',  // Rain Showers: Slight 
      'PARTLY_CLOUDY'           : '29',  // Partly cloudy
      'RAIN_SHOWERS'            : '45',  // Showers
      'SNOW_SHOWERS'            : '46',  // Snow showers
      'THUNDERSHOWER'           : '47'   // Thundery showers
    }
  };
    return isDaytime === false && icons.night[icon] 
      ? icons.night[icon] 
      : icons.day[icon] || 'na';
  }

  async _tradutor(text) {
    try {
      const lineBreak = '(1)';
      const cleanText = text.replace(/\n/g, lineBreak);
      const query = encodeURIComponent(cleanText);
      const translate = await this._loadData(this._languageURL, 'translate', this._paramsTranslate(query));
      let textTranslate = translate[0][0][0].split(lineBreak).join('\n');
      textTranslate = textTranslate.toLowerCase();
      textTranslate = textTranslate.charAt(0).toUpperCase() + textTranslate.slice(1);
      return textTranslate;
    } catch (e) {
      global.logError(`BBC Weather: Error translating "${text}": ${e}`);
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
    } catch (err) {
      global.logError(`Open-Meteo: Error in translate for "${str}": ${err.message}`);
      return str;
    }
}