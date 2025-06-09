// Open-Meteo Non-comercial Weather Driver JSON API (Refatored)
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

var currentDriverInstance = null; // Variável global para armazenar a instância

var Driver = class Driver extends wxBase.Driver {
  constructor(stationID, version) {
    super(stationID);
    this.version = version;
    currentDriverInstance = this; // Atualiza a instância global ao criar
    
    this.capabilities.cc.visibility = false;

    this.drivertype = 'Open-Meteo';
    this.maxDays = MAX_DAYS;
    this.linkText = 'Open-Meteo';
    this._baseURL = `https://api.open-meteo.com/v1/forecast`;
    this._locationURL = `https://nominatim.openstreetmap.org/reverse`;
    this._languageURL = `https://translate.googleapis.com/translate_a/single`;
    this.userAgent = `(${UUID} ${this.version}; Contact: https://github.com/linuxmint/cinnamon-spices-desklets/issues)`;
    this.linkIcon = { file: 'openmeteo', width: 120, height: 36};
    
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
    
    this.latitude = '';
    this.longitude = '';
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
        wind_speed: ''
      },
      days: Array(MAX_DAYS).fill().map(() => ({
        day: '', 
        humidity: '', 
        icon: '', 
        maximum_temperature: '', 
        minimum_temperature: '',
        pressure: '', 
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
      
      const forecast = await this._loadData(this._baseURL, 'forecast', this._paramsData());
      await this._parseLocation(forecast);

      const meta = await this._loadData(this._locationURL, 'meta', this._paramsGeocode());

      this._emptyData();

      await Promise.all([
        this._parseMetaData(meta, forecast),
        this._parseCurrentData(forecast),
        this._parseForecastData(forecast)
      ]);

      deskletObj.displayMeta();
      deskletObj.displayCurrent();
      deskletObj.displayForecast();

      return true;
    } catch (err) {
      global.logError(`Open-Meteo: error: ${err.message}`);
      this._showError(deskletObj, await _('An unexpected error occurred:\n') + err.message);
    }
  }

  _paramsData() {
    return {
      latitude: this.latlon[0],
      longitude: this.latlon[1],
      current: ['temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'is_day', 'weather_code', 'surface_pressure', 'wind_speed_10m', 'wind_direction_10m'],
      daily: ['weather_code', 'temperature_2m_max', 'temperature_2m_min', 'wind_speed_10m_max', 'wind_direction_10m_dominant', 'relative_humidity_2m_mean', 'surface_pressure_mean'],
      timezone: 'auto'
    };
  }

  _paramsGeocode() {
    return {
      lat: this.latitude,
      lon: this.longitude,
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
      const rawData = await this._getWeatherAsync(URL, params);
      const json = JSON.parse(rawData);
      if (URL.includes(this._locationURL)) return json.type ? json : false;
      if (URL.includes(this._baseURL)) return json.latitude ? json : false;
      if (URL.includes(this._languageURL)) return json[0] ? json : false;
    } catch (err) {
      global.logError(`Open-Meteo: Error loading data ${API}: ${err.message}`);
      return false;
    }
  }  

  async _parseLocation(forecast) {
    try{
      this.latitude = forecast.latitude;
      this.longitude = forecast.longitude;
    } catch (err) {
      global.logError(`Error parsing location data: ${err.message}`);
      this.data.status.meta = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = await _(`Error processing lat,lon\nin forecast data:\n`) + err.message;
    }
    return true;
  }

  async _parseMetaData(meta, forecast) {
    try {
      Object.assign(this.data, {
        city: meta.address.city,
        country: meta.address.country,
        wgs84: {lat: forecast.latitude, lon: forecast.longitude},
      });
      this.data.status.meta = SERVICE_STATUS_OK;
    } catch (err) {
      global.logError(`Error parsing meta data: ${err.message}`);
      this.data.status.meta = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = await _(`Error processing location data:\n`) + err.message;
    }
  }

  async _parseCurrentData(forecast) {
    try {
      const isDay = forecast.current.is_day;
      let current = forecast.current;

      Object.assign(this.data.cc, {
        temperature: current.temperature_2m,
        feelslike: current.apparent_temperature,
        wind_speed: current.wind_speed_10m,
        wind_direction: this.compassDirection(current.wind_direction_10m),
        humidity: current.relative_humidity_2m,
        pressure: current.surface_pressure,
        weathertext: await this._mapDescription(String(current.weather_code), isDay),
        icon: this._mapIcon(String(current.weather_code), isDay),
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

  async _parseForecastData(forecast) {
    try {
      const isDay = forecast.current.is_day;
      let forecasts = forecast.daily;
      for (let i = 0; i < this.maxDays; i++) {
        Object.assign(this.data.days[i], {
          day: this._getDayName(i),
          maximum_temperature: forecasts.temperature_2m_max[i],
          minimum_temperature: forecasts.temperature_2m_min[i],
          wind_speed: forecasts.wind_speed_10m_max[i],
          wind_direction: this.compassDirection(forecasts.wind_direction_10m_dominant[i]),
          weathertext: await this._mapDescription(String(forecasts.weather_code[i]), i === 0 ? isDay : true),
          icon: this._mapIcon(String(forecasts.weather_code[i]), i === 0 ? isDay : true),
          humidity: forecasts.relative_humidity_2m_mean[i],
          pressure: forecasts.surface_pressure_mean[i],
        });
      }
      this.data.status.forecast = SERVICE_STATUS_OK;
    } catch (err) {
      global.logError(`Error parsing forecast data: ${err.message}`);
      this.data.status.lasterror = await _(`Error processing forecast data:\n`) + err.message;
      return false;
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

  _mapIcon(icon, isDay) {
    const icons = {
      day: {
        '0': '32',   // Clear Sky (Sunny)
        '1': '34',   // Mainly Clear
        '2': '30',   // Partly cloudy
        '3': '26d',  // Overcast (day or night)
        '45': '20',  // Fog (day or night)
        '48': '20',  // Depositing Rime Fog (day or night)
        '51': '09',  // Drizzle: Light Intensity (day or night)
        '53': '09',  // Drizzle: Moderate Intensity (day or night)
        '55': '09',  // Drizzle: Dense Intensity (day or night)
        '56': '08',  // Freezing Drizzle: Light Intensity (day or night)
        '57': '08',  // Freezing Drizzle: Dense Intensity (day or night)
        '61': '11',  // Rain: Slight Intensity (day or night)
        '63': '12',  // Rain: Moderate Intensity (day or night)
        '65': '12',  // Rain: Heavy Intensity (day or night)
        '66': '10',  // Freezing Rain: Light Intensity (day or night)
        '67': '10',  // Freezing Rain: Heavy Intensity (day or night)
        '71': '13',  // Snowfall: Slight Intensity (day or night)
        '73': '14',  // Snowfall: Moderate Intensity (day or night)
        '75': '16',  // Snowfall: Heavy Intensity (day or night)
        '77': '18',  // Snow Grains (day or night)
        '80': '39',  // Rain Showers: Slight
        '81': '37',  // Rain Showers: Moderate
        '82': '04',  // Rain Showers: Violent
        '85': '41',  // Snow Showers: Slight
        '86': '41',  // Snow Showers: Heavy
        '95': '04',  // Thunderstorm: Slight or Moderate (day or night)
        '96': '04',  // Thunderstorm with slight hail (day or night)
        '99': '04'   // Thunderstorm with heavy hail (day or night)
      },
      night: {
        '0': '31',   // Clear Sky'
        '1': '33',   // Mainly Clear
        '2': '29',   // Partly cloudy
        '80': '45',  // Rain Showers: Slight 
        '81': '47',  // Rain Showers: Moderate
        '85': '46',  // Snow Showers: Slight 
        '86': '46'   // Snow Showers: Heavy 
      }
    };
    return isDay != 1 && icons.night[icon] 
      ? icons.night[icon] 
      : icons.day[icon] || 'na';
  }

  async _mapDescription(text, isDay = 1) {
    const textMap = {
      '0' : isDay ? 'Sunny': 'Clear Sky',        // Clear sky
      '1' : 'Mainly Clear',                      // Mainly clear
      '2' : 'Partly Cloudy',                     // Partly cloudy
      '3' : 'Overcast',                          // Overcast
      '45': 'Fog',                               // Fog
      '48': 'Depositing Rime Fog',               // Depositing Rime Fog
      '51': 'Drizzle: Light Intensity',          // Drizzle: Light Intensity 
      '53': 'Drizzle: Moderate Intensity',       // Drizzle: Moderate Intensity
      '55': 'Drizzle: Dense Intensity',          // Drizzle: Dense Intensity
      '56': 'Freezing Drizzle: Light Intensity', // Freezing Drizzle: Light Intensity (day or night)
      '57': 'Freezing Drizzle: Dense Intensity', // Freezing Drizzle: Dense Intensity (day or night)
      '61': 'Rain: Slight Intensity',            // Rain: Slight Intensity (day or night)
      '63': 'Rain: Moderate Intensity',          // Rain: Moderate Intensity (day or night)
      '65': 'Rain: Heavy Intensity',             // Rain: Heavy Intensity (day or night)
      '66': 'Freezing Rain: Light Intensity',    // Freezing Rain: Light Intensity (day or night)
      '67': 'Freezing Rain: Heavy Intensity',    // Freezing Rain: Heavy Intensity (day or night)
      '71': 'Snowfall: Slight Intensity',        // Snowfall: Slight Intensity (day or night)
      '73': 'Snowfall: Moderate Intensity',      // Snowfall: Moderate Intensity (day or night)
      '75': 'Snowfall: Heavy Intensity',         // Snowfall: Heavy Intensity (day or night)
      '77': 'Snow Grains',                       // Snow Grains (day or night)
      '80': 'Rain Showers: Slight',              // Rain Showers: Slight
      '81': 'Rain Showers: Moderate',            // Rain Showers: Moderate
      '82': 'Rain Showers: Violent',             // Rain Showers: Violent
      '85': 'Snow Showers: Slight',              // Snow Showers: Slight
      '86': 'Snow Showers: Heavy',               // Snow Showers: Heavy
      '95': 'Thunderstorm: Slight or Moderate',  // Thunderstorm: Slight or Moderate (day or night)
      '96': 'Thunderstorm with slight hail',     // Thunderstorm with slight hail (day or night)
      '99': 'Thunderstorm with heavy hail'       // Thunderstorm with heavy hail (day or night)
    };
    if (!text) return '';
    if (!textMap[text]) return '';
    try {
      return await _(textMap[text]);
    } catch (err) {
      global.logError(`Open-Meteo: Error translating description: ${e}`);  
      return textMap[text];
    }
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
      global.logError(`Open-Meteo: Error translating "${text}": ${e}`);
      return text; // Fallback: return original text
    }
  }

};

async function _(str) {
    if (!str) return '';
    try {
      let driver;
      if (!driver) driver = new Driver;
      if (Gettext.dgettext(UUID, str) && Gettext.dgettext(UUID, str) !== str) return Gettext.dgettext(UUID, str);
      if (Gettext.dgettext('cinnamon', str) && Gettext.dgettext('cinnamon', str) !== str) return Gettext.dgettext('cinnamon', str); 
      if (currentDriverInstance) {
            return await currentDriverInstance._tradutor(str) || str;
        }
        return str;
    } catch (err) {
      global.logError(`Open-Meteo: Error in translate for "${str}": ${err.message}`);
      return str;
    }
  }