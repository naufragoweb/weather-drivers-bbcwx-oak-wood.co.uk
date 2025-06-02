// Open Weather Map Free Driver JSON API 
// Created using ECMAScript 6 standart

const UUID = 'bbcwx@oak-wood.co.uk';
const DESKLET_DIR = imports.ui.deskletManager.deskletMeta[UUID].path;
imports.searchPath.push(`${DESKLET_DIR}/drivers`);
const wxBase = imports.wxbase;
const GLib = imports.gi.GLib;
const Gettext = imports.gettext;

const { SERVICE_STATUS_ERROR, SERVICE_STATUS_OK, SERVICE_STATUS_INIT } = wxBase;
const MAX_DAYS = 5;

Gettext.bindtextdomain(UUID, GLib.get_home_dir() + '/.local/share/locale');

function _(str) {
  return str ? Gettext.dgettext(UUID, str) || Gettext.dgettext('cinnamon', str) || str : '';
}

var Driver = class Driver extends wxBase.Driver {
  constructor(stationID, apikey) {
    super(stationID, apikey);
    
    this.capabilities.cc.pressure_direction = false;
    this.capabilities.meta.region = false;
    
    this.drivertype = 'OWMFree';
    this.maxDays = MAX_DAYS;
    this.minTTL = 3600;
    this.linkText = 'openweathermap.org';
    this._baseURL = 'https://api.openweathermap.org/data/2.5';
    this.linkURL = 'https://openweathermap.org/city/';
    this.linkIcon = { file: 'owmfree', width: 70, height: 32 };
    
    this.locationID = '';
    this.latlon = [];
    this.lang_map = {
      'ar': 'ar', 'af': 'af', 'az': 'az', 'be': 'be', 'bg': 'bg', 'ca': 'ca', 'cz': 'cz', 
      'da': 'da', 'de': 'de', 'eu': 'eu', 'el': 'el', 'en': 'en', 'es': 'es', 'fa': 'fa', 
      'fi': 'fi', 'fr': 'fr', 'gl': 'gl', 'he': 'he', 'hi': 'hi', 'hr': 'hr', 'hu': 'hu', 
      'id': 'id', 'is': 'is', 'it': 'it', 'ja': 'ja', 'kr': 'kr', 'ku': 'ku', 'la': 'la', 
      'lt': 'lt', 'mk': 'mk', 'nl': 'nl', 'no': 'no', 'pl': 'pl', 'pt': 'pt', 'pt_br': 'pt_br', 
      'ro': 'ro', 'ru': 'ru', 'se': 'se', 'sk': 'sk', 'sl': 'sl', 'sp': 'sp', 'sr': 'sr', 
      'sv': 'sv', 'th': 'th', 'tr': 'tr', 'ua': 'ua', 'uk': 'uk', 'vi': 'vi', 'zh_cn': 'zh_cn', 
      'zh_tw': 'zh_tw', 'zu': 'zu'
    };
  }

  _emptyData() {
    this.data = {
      city: '', country: '',
      wgs84: { lat: '', lon: '' },
      cc: {
        feelslike: '', has_temp: false, humidity: '', icon: '', pressure: '',
        temperature: '', visibility: '', weathertext: '', wind_direction: '', wind_speed: ''
      },
      days: Array(MAX_DAYS).fill().map(() => ({
        day: '', humidity: '', icon: '', maximum_temperature: '', minimum_temperature: '',
        pressure: '', weathertext: '', wind_direction: '', wind_speed: ''
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

      const params = { ...this._params(), lang: this.getLangCode() };

      if (this.latlon?.length === 2) {
        params['lat'] = this.latlon[0];
        params['lon'] = this.latlon[1];
      } else {
        params['id'] = this.locationID;
      }

      let currentURL = `${this._baseURL}/weather`;
      let forecastURL = `${this._baseURL}/forecast`;
      const [current, forecast] = await Promise.all([
        this._loadDataWithParams(currentURL, 'current', params),
        this._loadDataWithParams(forecastURL, 'forecast', params)
      ]);

      if (!current || !forecast) {
        return this._showError(deskletObj, _('Failed to load some weather data'));
      }

      this._emptyData();

      await Promise.all([
        this._parseMetaData(forecast),
        this._parseCurrentData(current),
        this._parseForecastData(forecast)
      ]);

      this.linkURL = this.linkURL + this.locationID;

      deskletObj.displayMeta();
      deskletObj.displayCurrent();
      deskletObj.displayForecast();

      return true;
    } catch (err) {
     global.logError(`OWMFree error: ${err.message}`);
      this._showError(deskletObj, _('An unexpected error occurred: %s').format(err.message));
      return false;
    }
  }

  _params() {
    return { appid: this.apikey, units: 'metric'};
  }

  async _verifyStation() {
    if (!this.apikey) {
      this._emptyData();
      this.data.status.meta = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('API key\nis empty or not defined.');
      this.latlon = null;
      this.locationID = null;
      return false;
    }

    if (!this.stationID || typeof this.stationID !== 'string' || this.stationID.trim() === "") {
      this._emptyData();
      this.data.status.meta = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('Location\nis empty or not defined.');
      this.latlon = null;
      this.locationID = null;
      return false;
    }

    // Regex to strictly match the GeonameID format, allowing 7 or 8 characters.
    const geonameId = /^\d{7,8}$/;
    const match0 = this.stationID.match(geonameId);
    if (match0) {
      this.locationID = this.stationID;
      this.latlon = null; 
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
        this.data.status.lasterror = _('Invalid latitude or longitude\nvalues in Location.');
        this.latlon = null;
        this.locationID = null;
        return false;
      }

      this.latlon = [lat, lon];
      this.locationId = null;
      return true;
    }
    this._emptyData();
    this.data.status.meta = SERVICE_STATUS_ERROR;
    this.data.status.lasterror = _('Invalid Location format.\nExpected: "latitude,longitude"\nor a valid code location.');
    this.latlon = null;
    this.locationID = null;
    return false;
  }

    _getWeatherAsync(url, params) {
      return new Promise((resolve, reject) => {
        this._getWeather(url, (weather) => {
          weather ? resolve(weather) : reject(new Error(`Failed to retrieve data from ${url}`));
        }, params);
      });
  }

  async _loadDataWithParams(URL, API, params) {
    try {
      const rawData = await this._getWeatherAsync(URL, params);
      const json = JSON.parse(rawData);
      return json?.cod ? json : false;
    } catch (err) {
      global.logError(`OWMFree: Error loading data ${API}: ${err.message}`);
      return false;
    }
  }  

  async _parseMetaData(forecast) {
    try {
      const location = forecast.city;
      Object.assign(this.data, {
        city: location.name,
        country: location.country,
        wgs84: { lat: location.coord.lat, lon: location.coord.lon }
      });
      
      this.locationID ||= location.id;
      this.data.status.meta = SERVICE_STATUS_OK;
    } catch (err) {
      global.logError(`Error parsing meta data: ${err.message}`);
      this.data.status.meta = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('Error processing meta data');
    }
    return true;
  }

  async _parseCurrentData(current) {
    try {
      const { main, wind, weather, visibility } = current;
      Object.assign(this.data.cc, {
        humidity: main.humidity,
        temperature: main.temp,
        has_temp: true,
        pressure: main.pressure,
        feelslike: main.feels_like,
        wind_speed: wind.speed,
        wind_direction: this.compassDirection(wind.deg),
        weathertext: weather[0].description.ucwords(),
        visibility: Math.round(visibility / 1000),
        icon: this._mapIcon(weather[0].icon)
      });

      this.locationID ||= current.id;
      this.data.status.cc = SERVICE_STATUS_OK;
    } catch (err) {
      global.logError(`Error parsing current data: ${err.message}`);
      this.data.status.cc = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('Error processing current conditions');
    }
    return true;
  }

  async _parseForecastData(forecast) {
    try {
      // DAY 0 (special conditions - uses ONLY the first block)
      Object.assign(this.data.days[0], {
        day: this._getDayName(0), // "Mon", "Tue", etc.
        icon: this._mapIcon(forecast.list[0].weather[0].icon),
        weathertext: forecast.list[0].weather[0].description,
        minimum_temperature: forecast.list[0].main.temp_min,
        maximum_temperature: forecast.list[0].main.temp_max,
        wind_speed: forecast.list[0].wind.speed,
        wind_direction: this.compassDirection(forecast.list[0].wind.deg),
        pressure: forecast.list[0].main.grnd_level,
        humidity: forecast.list[0].main.humidity
      });

      // DAYS 1-4 (grouping of blocks by day)
      const dailyBlocks = {};
      // Get the start of day 0 in UTC milliseconds to avoid timezone issues with just getDate()
      const day0StartTimestamp = new Date(Date.UTC(
        new Date(forecast.list[0].dt_txt).getUTCFullYear(), 
        new Date(forecast.list[0].dt_txt).getUTCMonth(), 
        new Date(forecast.list[0].dt_txt).getUTCDate())).getTime();

      // Group blocks by day (ignoring day0)
      forecast.list.forEach(block => {
        const blockStartTimestamp = new Date(Date.UTC(
          new Date(block.dt_txt).getUTCFullYear(), 
          new Date(block.dt_txt).getUTCMonth(), 
          new Date(block.dt_txt).getUTCDate())).getTime();
        const dayDiff = Math.round((blockStartTimestamp - day0StartTimestamp) / (1000 * 60 * 60 * 24));
        
        if (dayDiff >= 1 && dayDiff <= 4) { // Days 1 to 4 (only)
          if (!dailyBlocks[dayDiff]) {
            dailyBlocks[dayDiff] = [];
          }
          dailyBlocks[dayDiff].push(block);
        }
      });

      // Process each day grouped (1-4)
      for (let dayOffset = 1; dayOffset <= 4; dayOffset++) {
        const blocks = dailyBlocks[dayOffset];
        if (!blocks || blocks.length === 0) continue;

        // Filters day blocks (9h-18h)
      const dayBlocks = blocks.filter(block => {
        const hour = new Date(block.dt_txt).getHours();
        return hour >= 9 && hour <= 15; // <-- always next 3 hours
      });

        Object.assign(this.data.days[dayOffset], {
          day: this._getDayName(dayOffset),
          icon: '',
          weathertext: '',
          minimum_temperature: Infinity,
          maximum_temperature: -Infinity,
          wind_speed: 0,
          wind_direction: '',
          pressure: 0,
          humidity: 0
        });

        const day = Object.assign(this.data.days[dayOffset]);
        
        // Finds the most relevant condition (highest priority)
        let dominantIcon = blocks.find(b => 
           new Date(b.dt_txt).getHours() === 12) 
           || blocks[Math.floor(blocks.length / 2)]; // Fallback noon icon (12:00) for icon/description;

        let maxPriority = -1;

        dayBlocks.forEach(block => {
          const priority = this._getWeatherPriority(block.weather[0].icon) || 0;
          if (priority > maxPriority) {
            maxPriority = priority;
            dominantIcon = block.weather[0].icon;
          }
        });

        // Assigns icon and description
        day.icon = this._mapIcon(dominantIcon); // Returns the icon code (e.g. '12')
        const dominantBlock = dayBlocks.find(b => b.weather[0].icon === dominantIcon);
        day.weathertext = dominantBlock ? dominantBlock.weather[0].description : '';

        // Aggregates data from all blocks of the day
        let maxWindSpeed = 0;
        let maxWindDirection = '';
        
        blocks.forEach(block => {
          // Temperatures
          day.minimum_temperature = Math.min(day.minimum_temperature, block.main.temp_min);
          day.maximum_temperature = Math.max(day.maximum_temperature, block.main.temp_max);
          
          // Wind (direction of the strongest wind)
          if (block.wind.speed > maxWindSpeed) {
            maxWindSpeed = block.wind.speed;
            maxWindDirection = this.compassDirection(block.wind.deg);
          }
          
          // Pressure and humidity (maximum values)
          day.pressure = Math.max(day.pressure, block.main.grnd_level);
          day.humidity = Math.max(day.humidity, block.main.humidity);
        });

        day.wind_speed = maxWindSpeed;
        day.wind_direction = maxWindDirection;
      }

      this.data.status.forecast = SERVICE_STATUS_OK;        

    } catch (err) {
      global.logError(`Error parsing forecast data: ${err.message}`);
      this.data.status.cc = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('Error processing forecast data');
    }
    return true;
  }
  
  _getDayName(index) {
    const dayNamesAbbr = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return dayNamesAbbr[(new Date().getDay() + index) % 7];
  }

  _getWeatherPriority(iconCode) {
  const weatherPriority = {
    '01d': 2,     // Clear Sky
    '02d': 1,     // Few Clouds
    '03d': 3,     // Scattered clouds
    '04d': 4,     // Broken clouds
    '09d': 5,     // Shower rain
    '10d': 6,     // Rain
    '11d': 7,     // Thunderstorm
    '13d': 8,     // Snow
    '50d': 0,     // Mist
  };
  return weatherPriority[iconCode] ?? 'na'; // Fallback: 'na' icon
}

  _mapIcon(icon) {
    const iconMappings = {
      '01d': '32',  // clear sky day
      '01n': '31',  // clear sky night
      '02d': '34',  // few clouds day
      '02n': '33',  // few clouds night
      '03d': '28',  // scattered clouds
      '03n': '27',  // scattered clouds
      '04d': '26',  // broken clouds day
      '04n': '26',  // broken clouds night
      '09d': '39',  // shower rain day
      '09n': '45',  // shower rain night
      '10d': '12',  // rain day
      '10n': '12',  // rain night
      '11d': '04',  // thunderstorm day
      '11n': '04',  // thunderstorm night
      '13d': '16',  // snow day
      '13n': '16',  // snow night
      '50d': '20',  // mist day
      '50n': '20'   // mist night
    };
    return iconMappings[icon] || 'na';
  }
};