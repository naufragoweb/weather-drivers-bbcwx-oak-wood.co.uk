// BBC Weather Driver JSON API - Refactored Version
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
    this.capabilities.meta.region = false;
    
    this.drivertype = 'bbc';
    this.linkText = 'bbc.co.uk/weather';
    this.linkURL = 'https://www.bbc.com/weather/';
    this._locationURL = 'https://open.live.bbc.co.uk/locator/locations';
    this._baseURL = 'https://weather-broker-cdn.api.bbci.co.uk/en';
    this._languageURL = `https://translate.googleapis.com/translate_a/single`;
    this.userAgent = `(${UUID} ${this.version}; Contact: https://github.com/linuxmint/cinnamon-spices-desklets/issues)`;
    this.linkIcon = { file: 'bbc', width: 120, height: 51 };

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
    
    this.locationID = '';
    this.localURL = '';
  }

  _emptyData() {
    this.data = {
      city: '',
      country: '',
      wgs84: { lat: '', lon: '' },
      cc: {
        feelslike: '', 
        has_temp: false, 
        humidity: '', 
        icon: '', 
        pressure: '',
        pressure_direction: '', 
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

      let metaURL = this.latlon ? `${this._locationURL}` : `${this._locationURL}/${this.locationID}`;
      const meta = await this._loadData(metaURL, 'meta', this._params());

      if (this.latlon) await this._parseLocation(meta);

      let observationURL = `${this._baseURL}/observation/${this.locationID}`;
      let forecastURL = `${this._baseURL}/forecast/aggregated/${this.locationID}`;
      const [current, forecast] = await Promise.all([
        this._loadData(observationURL, 'observations'),
        this._loadData(forecastURL, 'forecasts')
      ]); 

      this.linkURL = `https://www.bbc.com/weather/${this.locationID}`;

      this._emptyData();

      await Promise.all([
        this._parseMetaData(meta),
        this._parseCurrentData(current, forecast),
        this._parseForecastData(forecast),
      ]);

      deskletObj.displayMeta();
      deskletObj.displayCurrent();
      deskletObj.displayForecast();
      
    } catch (err) {
      global.logError(`BBC Driver error: ${err.message}`);
      this._showError(deskletObj, await _('An unexpected error occurred:\n') + err.message);
    }
  }

  _params() {
    return this.latlon ? { 
      la: this.latlon[0], 
      lo: this.latlon[1], 
      format: 'json' 
    } : { format: 'json' };
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
      if (this.latlon) this.latlon = [];
      this.locationID = '';
      return false;
    }
    try {
      // Regex to strictly match the GeonameID format, allowing 7 or 8 characters.
      const geonameId = /^\d{7,8}$/;
      const match0 = this.stationID.match(geonameId);
      if (match0) {
        this.locationID = this.stationID; 
        return true;
      }

      // Regex to strictly match the format "lat,lon", allowing spaces around the comma.
      const latLon = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;
      const match1 = this.stationID.match(latLon);
      if (match1) {
        const lat = parseFloat(match1[1]);
        const lon = parseFloat(match1[2]);
        

        if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
          this._emptyData();
          this.data.status.meta = SERVICE_STATUS_ERROR;
          this.data.status.lasterror = 'Invalid values\nof latitude or longitude.';
          this.latlon = [];
          this.locationID = '';
          return false;
        }  
      this.latlon = [lat, lon];
      this.locationId = '';
      return true;
      }
      if (!match0 && !match1) {
        this._emptyData();
        this.data.status.meta = SERVICE_STATUS_ERROR;
        this.data.status.lasterror = 'Invalid Location format.\nExpected: "latitude,longitude"\nor a valid code location.';
        if (this.latlon) this.latlon = [];
        this.locationID = '';
        return false;
      }
    } catch (err) { 
      return false;
    }
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
      if (URL.includes(this._locationURL) || 
          URL.includes(this._languageURL)) {
      rawData = await this._getWeatherAsync(URL, params);
      }
      if (URL.includes(this._baseURL)) {
      rawData = await this._getWeatherAsync(URL);
      }
      const json = JSON.parse(rawData);
      if (URL.includes(this._locationURL)) return json.response ? json : false;
      if (URL.includes(this._baseURL)) return (json.observations || json.forecasts) ? json : false;
      if (URL.includes(this._languageURL)) return json[0] ? json : false;
    } catch (err) {
      global.logError(`BBC: Error loading data ${API}: ${err.message}`);
      return false;
    }
  }  

  async _parseLocation(meta) {
    try {
      this.locationID = meta.response.results.results[0].id;
      this.data.status.meta = SERVICE_STATUS_OK;
      return true;
    } catch (err) {
      global.logError(`BBC: Error parsing location from meta (locationID): ${err.message}`);
      this.data.status.lasterror = await _('Failed to determine location ID from coordinates.');
      return false;
    }
  }

  async _parseMetaData(meta) {
    try{
      const loc = this.latlon ? meta.response.results.results[0] : meta.response;    
      Object.assign(this.data, {
        city: loc.name,
        country: loc.country,
        wgs84: { lat: loc.lat, lon: loc.lon },
      })
      this.data.status.meta = SERVICE_STATUS_OK;
    } catch (err) {
      global.logError(`Error parsing meta data: ${err.message}`);
      this.data.status.meta = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = await _(`Error processing location data:\n`) + err.message;
    }
    return true;
  }

  async _parseCurrentData(current, forecast) {
    try {
      const obs = current.observations[0];
      const fobs = forecast.forecasts[0].detailed.reports[0];
      const isNight = forecast.isNight;
      
      Object.assign(this.data.cc, {
        temperature: obs.temperature.C,
        feelslike: fobs.feelsLikeTemperatureC,
        wind_speed: obs.wind.windSpeedKph,
        wind_direction: obs.wind.windDirectionAbbreviation,
        humidity: obs.humidityPercent || fobs.humidity,
        pressure: obs.pressureMb || fobs.pressure,
        pressure_direction: obs.pressureDirection || fobs.pressureDirection,
        visibility: await _(String(obs.visibility)) || await _(String(fobs.visibility)),
        weathertext: await this._mapDescription(String(fobs.weatherTypeText)),
        icon: this._mapIcon(String(fobs.weatherType), isNight),
        has_temp: true
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
      const isNight = forecast.isNight;
        
      for (let i = 0; i < this.maxDays; i++) {
        const dayData = forecast.forecasts[i];
        const sum = dayData.summary.report;
        const det = dayData.detailed.reports[0];
        const weatherText = await this._mapDescription(String(sum.weatherTypeText));
          
        Object.assign(this.data.days[i], {
          day: this._getDayName(i),
          maximum_temperature: sum.maxTempC,
          minimum_temperature: sum.minTempC,
          weathertext: weatherText,
          wind_direction: sum.windDirection,
          wind_speed: sum.windSpeedKph,
          icon: this._mapIcon(String(sum.weatherType), i === 0 ? isNight : false),
          humidity: det.humidity,
          pressure: det.pressure
        });
      };
      this.data.status.forecast = SERVICE_STATUS_OK;
    } catch (err) {
      global.logError(`Error parsing forecast data: ${err.message}`);
      this.data.status.forecast = SERVICE_STATUS_ERROR;
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

  _mapIcon(icon, isNight) {
    const icons = {
      day: {
        '1': '32',  // Sunny
        '2': '30',  // Partly Cloudy
        '3': '30',  // Sunny Intervals
        '4': '23',  // Sandstorm
        '5': '20',  // Mist
        '6': '20',  // Fog
        '7': '26',  // Light Cloud
        '8': '26',  // Thick Cloud
        '10': '11', // Light Rain Showers (day)
        '11': '09', // Drizzle
        '12': '11', // Light Rain
        '14': '12', // Heavy Rain Showers (day)
        '15': '12', // Heavy Rain
        '17': '18', // Sleet Showers (day)
        '18': '18', // Sleet
        '20': '18', // Hail Showers (day)
        '21': '18', // Hail
        '23': '14', // Light Snow Showers (day)
        '24': '13', // Light Snow
        '26': '16', // Heavy Snow Showers (day)
        '27': '16', // Heavy Snow
        '29': '04', // Thundery Showers (day)
        '30': '04', // Thunderstorms
        '31': '01', // Tropical storm
        '32': '22', // Hazy
        '33': '15', // Blowing Snow
        '34': '20', // Mist
        '35': '23', // Sandstorm
        '36': '26', // Light Cloud
        //'37': '16',  //Heavy Snow Showers (???)
        '38': '09', // Drizzle
        '39': '11'  // Light Rain
      },
      night: {
        '0': '31',  // Clear Sky
        '1': '31',  // Sunny
        '2': '29',  // Partly Cloudy
        '3': '29',  // Sunny Intervals
        '9': '11',  // Light Rain Showers (night)
        '13': '12', // Heavy Rain showers (night)
        '16': '18', // Sleet Showers (night)
        '19': '18', // Hail Showers (night)
        '22': '46', // Light Snow Showers (night)
        '25': '16', // Heavy Snow Showers (night)
        '28': '04', // Thundery Showers (night)
        '32': '21'  // Hazy
      }
    };

    return isNight === true && icons.night[icon] 
      ? icons.night[icon] 
      : icons.day[icon] || 'na';
  }

  async _mapDescription(text) {
    const textMap = {
      'Sandstorm'         : 'Sand Storm',
      'Light Rain Showers': 'Light Rain Shower',
      'Heavy Rain Showers': 'Heavy Rain Shower',
      'Sleet Showers'     : 'Sleet Shower',
      'Hail Showers'      : 'Hail Shower',
      'Thundery Showers'  : 'Thundery Shower'
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

