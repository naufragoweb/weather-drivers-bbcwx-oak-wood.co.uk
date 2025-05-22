// Open Weather Map Free Driver JSON API 

const UUID = 'bbcwx@oak-wood.co.uk';
const DESKLET_DIR = imports.ui.deskletManager.deskletMeta[UUID].path;
imports.searchPath.push(`${DESKLET_DIR}/drivers`);
const wxBase = imports.wxbase;
const GLib = imports.gi.GLib;
const Gettext = imports.gettext;

const SERVICE_STATUS_ERROR = wxBase.SERVICE_STATUS_ERROR;
const SERVICE_STATUS_OK = wxBase.SERVICE_STATUS_OK;
const SERVICE_STATUS_INIT = wxBase.SERVICE_STATUS_INIT;

const OWMFREE_DRIVER_MAX_DAYS = 5; // Constant for the number of OWMFree days

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
    this.maxDays = 5;
    this.minTTL = 3600;
    this.linkText = 'openweathermap.org';
    this._baseURL = 'https://api.openweathermap.org/data/2.5/';
    this.linkURL = 'https://openweathermap.org/city/';

    this.linkIcon = {
        file: 'owmfree',
        width: 70,
        height: 32
    };

    this.locationID = '';
    this.latlon = [];

    this.lang_map = {
      'ar': 'ar',   // Arabic
      'af': 'af',   // Afrikaans
      'az': 'az',   // Azerbaijani
      'be': 'be',   // Belarusian
      'bg': 'bg',   // Bulgarian
      'ca': 'ca',   // Catalan
      'cz': 'cz',   // Czech
      'da': 'da',   // Danish
      'de': 'de',   // German
      'eu': 'eu',   // Basque
      'el': 'el',   // Greek
      'en': 'en',   // English
      'es': 'es',   // Spanish
      'fa': 'fa',   // Farsi (Persian)
      'fi': 'fi',   // Finnish
      'fr': 'fr',   // French
      'gl': 'gl',   // Galician
      'he': 'he',   // Hebrew
      'hi': 'hi',   // Hindi
      'hr': 'hr',   // Croatian
      'hu': 'hu',   // Hungarian
      'id': 'id',   // Indonesian
      'is': 'is',   // Icelandic
      'it': 'it',   // Italian
      'ja': 'ja',   // Japanese
      'kr': 'kr',   // Korean
      'ku': 'ku',   // Kurdish
      'la': 'la',   // Latin (Latvian)
      'lt': 'lt',   // Lithuanian
      'mk': 'mk',   // Macedonian
      'nl': 'nl',   // Dutch
      'no': 'no',   // Norwegian
      'pl': 'pl',   // Polish
      'pt': 'pt',   // Portuguese
      'pt_br': 'pt_br',   // Portuguese (Brazilian)
      'ro': 'ro',   // Romanian
      'ru': 'ru',   // Russian
      'se': 'se',   // Swedish
      'sk': 'sk',   // Slovak
      'sl': 'sl',   // Slovenian
      'sp': 'sp',   // Spanish
      'sr': 'sr',   // Serbian
      'sv': 'sv',   // Swedish
      'th': 'th',   // Thai
      'tr': 'tr',   // Turkish
      'ua': 'ua',   // Ukrainian
      'uk': 'uk',   // Ukrainian
      'vi': 'vi',   // Vietnamese
      'zh_cn': 'zh_cn',   // Simplified Chinese
      'zh_tw': 'zh_tw',   // Traditional Chinese
      'zu': 'zu'    // Zulu
    };
  }

  // Override _emptyData from wxbase.js to avoid race conditions
  // when initializing this.data.days.
  _emptyData() {
    // Initializes the metadata parts of this.data
    this.data.city = '';
    this.data.country = '';
    this.data.wgs84 = new Object();
    this.data.wgs84.lat = '';
    this.data.wgs84.lon = '';

    // Initializes the current conditions (cc) object
    this.data.cc = new Object();
    this.data.cc.feelslike = '';
    this.data.cc.has_temp = false;
    this.data.cc.humidity = '';
    this.data.cc.icon = '';
    this.data.cc.pressure = '';
    this.data.cc.temperature = '';
    this.data.cc.visibility = '';
    this.data.cc.weathertext = '';
    this.data.cc.wind_direction = '';
    this.data.cc.wind_speed = '';

    // Constructs a new array and assigns it atomically.
    this.data.days = [];
    
    // Use the constant OWMFREE_DRIVER_MAX_DAYS to ensure the array is always the correct size for BBC,
    // regardless of the value of this.maxDays during the call to super() in the constructor.
    // This ensures that the array is always the correct size, regardless of the original this.maxDays value in wxbase.
    for (let i = 0; i < OWMFREE_DRIVER_MAX_DAYS; i++) {
      this.data.days[i] = {
        day: '',
        humidity: '',
        icon: '',
        maximum_temperature: '',
        minimum_temperature: '',
        pressure: '',
        weathertext: '',
        wind_direction: '',
        wind_speed: ''
      };
    }
  }
      
  async refreshData(deskletObj) {

    try{
      // reset the services object at the beginning of refreshData
      this.data.status = {};
      this.data.status.cc = SERVICE_STATUS_INIT;
      this.data.status.forecast = SERVICE_STATUS_INIT;
      this.data.status.meta = SERVICE_STATUS_INIT;
      this.data.status.lasterror = false;

      // Check user input for stationID
      if (!await this._verify_station()) {
        return this._showError(deskletObj, _('Invalid Station ID'));
      }

      const params = this._params();

      if (typeof this.latlon != 'undefined' && this.latlon.length === 2) {
        params['lat'] = this.latlon[0];
        params['lon'] = this.latlon[1];
      } else {
        params['id'] = this.locationID;
      }

      this.langcode = this.getLangCode();
      if (this.langcode) params['lang'] = this.langcode;

      // Fetch API for current conditions
      const current = await this._load_current(params);
      if (!current) {
        return this._showError(deskletObj, _('Failed to get current data'));
      }

      // Fetch API for 5 days forecast
      const forecasts = await this._load_forecasts(params);
      if (!forecasts) {
        return this._showError(deskletObj, _('Failed to get forecast data'));
      }

      this._emptyData();

      // Load data in objects to display
      await this._parse_data(current, forecasts);

      this.linkURL = this.linkURL + this.locationID;

      // Display data in the desklet
      deskletObj.displayMeta();
      deskletObj.displayCurrent();
      deskletObj.displayForecast();

      return true;
    } catch (error) {
      this._showError(deskletObj, error);
      return false;
    }
  }

  _params() {
    return {
      'appid': this.apikey,
      'units': 'metric',
    };
  }

  async _verify_station() {
    if (!this.stationID || typeof this.stationID !== 'string') {
      this.data.status.meta = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('Station ID not defined');
      return false;
    }
    if (!this.apikey) {
      this.data.status.meta = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('No API key provided');
      return false;
    }
    if (/^\-?\d+(\.\d+)?,\-?\d+(\.\d+)?$/.test(this.stationID)) {
      const [lat, lon] = this.stationID.split(',').map(v => parseFloat(v.trim()));
      this.latlon = [lat, lon];
      this.locationID = '';
    } else {
      this.latlon = [];
      this.locationID = this.stationID;
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
      }, params); 
    });
  }

  async _load_current(params) {
    let currentURL = `${this._baseURL}/weather`
    try {
      // Use the new async helper
      const weather = await this._getWeatherAsync(currentURL, params);

      if (weather) {
        const json = JSON.parse(weather);
        // Basic check for expected structure
        if (!json.cod || json.cod != '200' ||  json.cod.length === 0) {
          this.data.status.cc = SERVICE_STATUS_ERROR;
          this.data.status.lasterror = _('Invalid current conditions response');
          return null;
        }
        this.data.status.cc = SERVICE_STATUS_OK;
        return json;
      }
    } catch (err) {
      global.logError(`Open Weather Map Free Driver: _load_current error: ${err.message}`);
      this.data.status.cc = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('Error retrieving current data: %s').format(err.message);
      return null;
    }
  }

  async _load_forecasts(params) {
    let forecastURL = `${this._baseURL}/forecast`
    try {
      // Use the new async helper
      const weather = await this._getWeatherAsync(forecastURL, params);

      if (weather) {
        const json = JSON.parse(weather);
        // Basic check for expected structure
        if (!json.cod || json.cod != '200' ||  json.cod.length === 0) {
          this.data.status.forecast = SERVICE_STATUS_ERROR;
          this.data.status.lasterror = _('Invalid forecast response');
          return null;
        }
      this.data.status.meta = SERVICE_STATUS_OK;
      this.data.status.forecast = SERVICE_STATUS_OK;
      return json;
      }
    } catch (err) {
      global.logError(`Open Weather Map Free Driver: _load_forecast error: ${err.message}`);
      this.data.status.meta = SERVICE_STATUS_ERROR;
      this.data.status.forecast = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('Error retrieving forecast data: %s').format(err.message);
      return null;
    }
  }

 async _parse_data(current, forecasts) {
  try{
    // Current conditions data
    if (!current.cod) {
        this.data.status.cc = SERVICE_STATUS_ERROR;
        this.data.status.lasterror = _('Missing location data');
        return false;
    }
    try {
        this.data.cc.humidity = current.main.humidity;
        this.data.cc.temperature = current.main.temp;
        this.data.cc.has_temp = true;
        this.data.cc.pressure = current.main.pressure;
        this.data.cc.feelslike = current.main.feels_like;
        this.data.cc.wind_speed = current.wind.speed;
        this.data.cc.wind_direction = this.compassDirection(current.wind.deg);
        this.data.cc.weathertext = current.weather[0].description.ucwords();
        this.data.cc.visibility = Math.round(current.visibility / 1000);
        this.data.cc.icon = this._mapicon(current.weather[0].icon);

        if (!this.locationID) {
          this.locationID = current.id;
        }
      
      this.data.status.cc = SERVICE_STATUS_OK;
    } catch (e) {
      global.logError(e);
      this.data.status.cc = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('Incomplete current conditions data');
      return false;
    }

    // Forecasts
    if (!forecasts.cod) {
        this.data.status.meta = SERVICE_STATUS_ERROR;
        this.data.status.forecast = SERVICE_STATUS_ERROR;
        this.data.status.lasterror = _('Missing forecast data');
        return false;
    }
    // Meta data
    try {
      this.data.city = forecasts.city.name;
      this.data.country = forecasts.city.country;
      this.data.wgs84.lat = forecasts.city.coord.lat;
      this.data.wgs84.lon = forecasts.city.coord.lon;

      if (!this.locationID) {
          this.locationID = forecasts.city.id;
        }

      this.data.status.meta = SERVICE_STATUS_OK;
    } catch (e) {
      global.logError(e);
      this.data.status.meta = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('Incomplete location metadata');
      return false;
    }
    
    //Forecast data
    try {
      // DAY 0 (special conditions - uses ONLY the first block)
      this.data.days[0] = {
        day: this._getDayName(0), // "Mon", "Tue", etc.
        icon: this._mapicon(forecasts.list[0].weather[0].icon),
        weathertext: forecasts.list[0].weather[0].description,
        minimum_temperature: forecasts.list[0].main.temp_min,
        maximum_temperature: forecasts.list[0].main.temp_max,
        wind_speed: forecasts.list[0].wind.speed,
        wind_direction: this.compassDirection(forecasts.list[0].wind.deg),
        pressure: forecasts.list[0].main.grnd_level,
        humidity: forecasts.list[0].main.humidity
      };

      // DAYS 1-4 (grouping of blocks by day)
      const dailyBlocks = {};
      const today = new Date(forecasts.list[0].dt_txt).getDate(); // Date of first block (day0)

      // Group blocks by day (ignoring day0)
      forecasts.list.forEach(block => {
        const blockDate = new Date(block.dt_txt).getDate();
        const dayDiff = blockDate - today;
        
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

        this.data.days[dayOffset] = {
          day: this._getDayName(dayOffset),
          icon: '',
          weathertext: '',
          minimum_temperature: Infinity,
          maximum_temperature: -Infinity,
          wind_speed: 0,
          wind_direction: '',
          pressure: 0,
          humidity: 0
        };

        const day = this.data.days[dayOffset];
        
        // Finds the most relevant condition (highest priority)
        let dominantIcon = blocks.find(b => 
           new Date(b.dt_txt).getHours() === 12) 
           || blocks[Math.floor(blocks.length / 2)]; // Fallback midday block (12:00) for icon/description;

        let maxPriority = -1;

        dayBlocks.forEach(block => {
          const currentIcon = block.weather[0].icon;
          const currentPriority = this._getWeatherPriority(currentIcon);
          if (currentPriority > maxPriority) {
            maxPriority = currentPriority;
            dominantIcon = currentIcon;
          }
        });

        // Assigns icon and description
        day.icon = this._mapicon(dominantIcon); // Returns the icon code (e.g. '12')
        day.weathertext = dayBlocks.find(b => b.weather[0].icon === dominantIcon).weather[0].description;

        

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

    } catch (e) {
        global.logError('OWM Free forecast parsing error: ' + e);
        this.data.status.forecast = SERVICE_STATUS_ERROR;
        this.data.status.lasterror = e.message;
    }
    return true;
    //End forecast data
  } catch (e) {
    this.data.status.meta = SERVICE_STATUS_ERROR;
    this.data.status.forecast = SERVICE_STATUS_ERROR;
    this.data.status.lasterror = _('Incomplete forecast data');
    return false;
  }
}

_getWeatherPriority(iconCode) {
  const weatherScale = {
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
  return weatherScale[iconCode] ?? 'na'; // Fallback: 'na' icon
}

  _mapicon(icon) {
    const icons = {
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
    }

    let iconCode = 'na';
    const iconKey = icon ? icon.toString() : '';

    if (icon && (typeof icons[icon] !== 'undefined')) {
    iconCode = icons[icon];
    }
    return iconCode;
  }
};
