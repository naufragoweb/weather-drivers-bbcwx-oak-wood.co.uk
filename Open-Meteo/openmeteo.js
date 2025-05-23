// Open-Meteo Non-comercial Weather Driver JSON API (Refatored)

const UUID = 'bbcwx@oak-wood.co.uk';
const DESKLET_DIR = imports.ui.deskletManager.deskletMeta[UUID].path;
imports.searchPath.push(`${DESKLET_DIR}/drivers`);
const wxBase = imports.wxbase;
const GLib = imports.gi.GLib;
const Gettext = imports.gettext;

const SERVICE_STATUS_ERROR = wxBase.SERVICE_STATUS_ERROR;
const SERVICE_STATUS_OK = wxBase.SERVICE_STATUS_OK;
const SERVICE_STATUS_INIT = wxBase.SERVICE_STATUS_INIT;

const OPENMETEO_DRIVER_MAX_DAYS = 7; // Constant for the number of Open-Meteo days

Gettext.bindtextdomain(UUID, GLib.get_home_dir() + '/.local/share/locale');

function _(str) {
  return str ? Gettext.dgettext(UUID, str) || Gettext.dgettext('cinnamon', str) || str : '';
}

var Driver = class Driver extends wxBase.Driver {
  // initialize the driver
  constructor(stationID) {
    super(stationID);
    
    this.capabilities.cc.visibility = false;

    this.drivertype = 'Open-Meteo';
    this.maxDays = 7;
    this.linkText = 'Open-Meteo';
    this._baseURL = `https://api.open-meteo.com/v1/forecast`;
    this._locationURL = `https://geocode.xyz/`;

    this.linkIcon = {
        file: 'openmeteo',
        width: 120,
        height: 36
    };

    this.latitude = '';
    this.longitude = '';
  }

  // Override _emptyData from wxbase.js to avoid race conditions
  // when initializing this.data.days.
  _emptyData() {
    // Initializes the metadata parts of this.data
    this.data.city = '';
    this.data.country = '';
    this.data.region = '';
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
    this.data.cc.weathertext = '';
    this.data.cc.wind_direction = '';
    this.data.cc.wind_speed = '';

    // Constructs a new array and assigns it atomically.
    this.data.days = [];
    
    // Use the constant OWMFREE_DRIVER_MAX_DAYS to ensure the array is always the correct size for BBC,
    // regardless of the value of this.maxDays during the call to super() in the constructor.
    // This ensures that the array is always the correct size, regardless of the original this.maxDays value in wxbase.
    for (let i = 0; i < OPENMETEO_DRIVER_MAX_DAYS; i++) {
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

    // reset the services object at the beginning of refreshData
    this.data.status = {};
    this.data.status.cc = SERVICE_STATUS_INIT;
    this.data.status.forecast = SERVICE_STATUS_INIT;
    this.data.status.meta = SERVICE_STATUS_INIT;
    this.data.status.lasterror = false;

    // Execute script synchronously
    try {

      // Check user input for stationID
      if (!await this._verify_station()) {
        return this._showError(deskletObj, _('Invalid Station ID'));
      }

      // Fetch API for data (current and 7 days forecast)
      const forecasts = await this._load_forecasts();
      if (!forecasts) {
        return this._showError(deskletObj, _('Failed to get forecast data'));
      }

      await this._parse_location(forecasts);

      // Fetch API for location (meta data)
      const meta = await this._load_meta();
      if (!meta) {
        return this._showError(deskletObj, _('Failed to get location metadata'));
      } 

      this._emptyData();

      // Load data in objects to display
      await this._parse_data(meta, forecasts);

      // Display data in the desklet
      deskletObj.displayMeta();
      deskletObj.displayCurrent();
      deskletObj.displayForecast();

      return true;

    } catch (err) {
      global.logError(`Open-Meteo Driver refreshData error: ${err.message}`);
      this._showError(deskletObj, _('An unexpected error occurred: %s').format(err.message));
    }
  }

  _params() {
    return {
      'latitude': this.latlon[0],
      'longitude': this.latlon[1],
      'current': ['temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'is_day', 'weather_code', 'surface_pressure', 'wind_speed_10m', 'wind_direction_10m'],
      'daily': ['weather_code', 'temperature_2m_max', 'temperature_2m_min', 'wind_speed_10m_max', 'wind_direction_10m_dominant', 'relative_humidity_2m_mean', 'surface_pressure_mean'],
      'timezone': 'auto'
    };
  }

  _params0() {
    return {
      'geoit': 'json'
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
      }, params); 
    });
  }

   async _load_forecasts() {
    let params = this._params();
    try {
      // Use the new async helper
      const weather = await this._getWeatherAsync(this._baseURL, params);

      if (weather) {
        const json = JSON.parse(weather);
        // Basic check for expected structure
        if (!json.latitude || json.latitude.length === 0) {
          this.data.status.cc = SERVICE_STATUS_ERROR;
          this.data.status.forecast = SERVICE_STATUS_ERROR;
          this.data.status.lasterror = _('Invalid forecast response');
          return null;
        }
      this.data.status.cc = SERVICE_STATUS_OK;
      this.data.status.forecast = SERVICE_STATUS_OK;
      return json;
      }
    } catch (err) {
      global.logError(`Open-Meteo Driver: _load_forecast error: ${err.message}`);
      this.data.status.cc = SERVICE_STATUS_ERROR;
      this.data.status.forecast = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('Error retrieving forecast data: %s').format(err.message);
      return null;
    }
  }

  async _load_meta() {
    let params = this._params0();
    let metaURL = `${this._locationURL}${this.latitude},${this.longitude}`
    try {
      // Use the new async helper
      const weather = await this._getWeatherAsync(metaURL, params);

      if (weather) {
        const json = JSON.parse(weather);
        // Basic check for expected structure
        if (!json.city || json.city.length === 0) {
          this.data.status.meta = SERVICE_STATUS_ERROR;
          this.data.status.lasterror = _('Invalid current conditions response');
          return null;
        }
        this.data.status.meta = SERVICE_STATUS_OK;
        return json;
      }
    } catch (err) {
      global.logError(`Open-Meteo Driver: _load_meta error: ${err.message}`);
      this.data.status.cc = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('Error retrieving current data: %s').format(err.message);
      return null;
    }
  }

  async _parse_location(forecasts) {
    if (!forecasts) {
      this.data.status.meta = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('Missing location data');
      return false;
    }
    // Acquire real location from Open Meteo base for identification
    this.latitude = forecasts.latitude;
    this.longitude = forecasts.longitude;

    this.data.status.meta = SERVICE_STATUS_OK;
    return true;
  }

  async _parse_data(meta, forecasts) {
    if (!meta) {
        this.data.status.meta = SERVICE_STATUS_ERROR;
        this.data.status.lasterror = _('Missing meta data');
        return false;
    }
    if (!forecasts) {
        this.data.status.cc = SERVICE_STATUS_ERROR;
        this.data.status.forecast = SERVICE_STATUS_ERROR;
        this.data.status.lasterror = _('Missing current and forecast data');
        return false;
    }

    // Meta data
    try {
      this.data.city = meta.city;
      this.data.region = meta.state;
      this.data.country = meta.country;
      this.data.wgs84 = {
        lat: forecasts.latitude,
        lon: forecasts.longitude
      };

      this.data.status.meta = SERVICE_STATUS_OK;
    } catch (e) {
      global.logError(e);
      this.data.status.meta = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('Incomplete location metadata');
      return false;
    }

    const isDay = forecasts.current.is_day == 1;

    // Current conditions data
    try {
      let current = forecasts.current;

      this.data.cc.has_temp = true;
      this.data.cc.temperature = current.temperature_2m;
      this.data.cc.feelslike = current.apparent_temperature;
      this.data.cc.wind_speed = current.wind_speed_10m;
      this.data.cc.wind_direction = this.compassDirection(current.wind_direction_10m);
      this.data.cc.humidity = current.relative_humidity_2m;
      this.data.cc.pressure = current.surface_pressure;
      this.data.cc.weathertext = this._mapDescription(current.weather_code, isDay);
      this.data.cc.icon = this._mapicon(current.weather_code, isDay);

      this.data.status.cc = SERVICE_STATUS_OK;
    } catch (e) {
      global.logError(e);
      this.data.status.cc = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('Incomplete current conditions data');
      return false;
    }

    // Forecast data
    try {
      let forecast = forecasts.daily;
      for (let i = 0; i < forecast.time.length; i++) {
        let day = new Object();
        day.day = this._getDayName(new Date(forecast.time[i]).getUTCDay());

        day.maximum_temperature = forecast.temperature_2m_max[i];
        day.minimum_temperature = forecast.temperature_2m_min[i];
        day.wind_speed = forecast.wind_speed_10m_max[i];
        day.wind_direction = this.compassDirection(forecast.wind_direction_10m_dominant[i]);
        day.weathertext = this._mapDescription(forecast.weather_code[i], i === 0 ? isDay : true);
        day.icon = this._mapicon(forecast.weather_code[i], i === 0 ? isDay : true);
        day.humidity = forecast.relative_humidity_2m_mean[i];
        day.pressure = forecast.surface_pressure_mean[i];

        this.data.days[i] = day;
      }

      this.data.status.forecast = SERVICE_STATUS_OK;
      return true;
    } catch (e) {
      global.logError(e);
      this.data.status.forecast = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('Incomplete forecast data');
      return false;
    }
  }

// Keeping 'i' as the parameter name, as per the original standard.
// The 'i' parameter is expected as the direct index of the day of the week,
// typically 0 for Sunday, 1 for Monday, ..., 6 for Saturday,
// as returned by Date.prototype.getUTCDay() or Date.prototype.getDay().

// Handles days in Glib format, where Sunday can be 7.
// Date.prototype.getUTCDay() (used in openmeteo.js) already returns 0 for Sunday,
// but this check is kept for compatibility in case the function
// is called with a Glib-style index.
  _getDayName(i) { 
    if (i == 7) {
      i = 0; // Converts Sunday (7) from Glib to Sunday (0) from JS.
    }

    let days = [ "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat" ];

    if (i >= 0 && i < days.length) {
      return days[i]; // Use 'i' directly as index.
    }
    global.log(`Open-Meteo: _getDayName received an invalid day index: ${i}`);
    return ""; // Return to an unexpected index.
  }

_mapicon(icon, isDay) {
    
    const icons = {
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
    };

    const nightIcons = {
      '0': '31',   // Clear Sky'
      '1': '34',   // Mainly Clear
      '2': '29',   // Partly cloudy
      '80': '39',  // Rain Showers: Slight 
      '81': '47',  // Rain Showers: Moderate
      '85': '46',  // Snow Showers: Slight 
      '86': '46'   // Snow Showers: Heavy 
    };

    let iconCode = 'na';
    const iconKey = icon ? icon.toString() : '';

    if (icon && (typeof icons[icon] !== 'undefined')) {
    iconCode = icons[icon];
    }

    if (!isDay && (typeof nightIcons[icon] !== 'undefined')) {
    iconCode = nightIcons[icon];
    }
    return iconCode;
  }

    _mapDescription(text, isDay = 1) {
      if (!text) return '';
      const textmap = {
        '0': isDay ? _('Sunny') : _('Clear Sky'),     // Clear sky
        '1': _('Mainly Clear'),                       // Mainly clear
        '2': _('Partly Cloudy'),                      // Partly cloudy
        '3': _('Overcast'),                           // Overcast
        '45': _('Fog'),                               // Fog
        '48': _('Depositing Rime Fog'),               // Depositing Rime Fog
        '51': _('Drizzle: Light Intensity'),          // Drizzle: Light Intensity 
        '53': _('Drizzle: Moderate Intensity'),       // Drizzle: Moderate Intensity
        '55': _('Drizzle: Dense Intensity'),          // Drizzle: Dense Intensity
        '56': _('Freezing Drizzle: Light Intensity'), // Freezing Drizzle: Light Intensity (day or night)
        '57': _('Freezing Drizzle: Dense Intensity'), // Freezing Drizzle: Dense Intensity (day or night)
        '61': _('Rain: Slight Intensity'),            // Rain: Slight Intensity (day or night)
        '63': _('Rain: Moderate Intensity'),          // Rain: Moderate Intensity (day or night)
        '65': _('Rain: Heavy Intensity'),             // Rain: Heavy Intensity (day or night)
        '66': _('Freezing Rain: Light Intensity'),    // Freezing Rain: Light Intensity (day or night)
        '67': _('Freezing Rain: Heavy Intensity'),    // Freezing Rain: Heavy Intensity (day or night)
        '71': _('Snowfall: Slight Intensity'),        // Snowfall: Slight Intensity (day or night)
        '73': _('Snowfall: Moderate Intensity'),      // Snowfall: Moderate Intensity (day or night)
        '75': _('Snowfall: Heavy Intensity'),         // Snowfall: Heavy Intensity (day or night)
        '77': _('Snow Grains'),                       // Snow Grains (day or night)
        '80': _('Rain Showers: Slight'),              // Rain Showers: Slight
        '81': _('Rain Showers: Moderate'),            // Rain Showers: Moderate
        '82': _('Rain Showers: Violent'),             // Rain Showers: Violent
        '85': _('Snow Showers: Slight'),              // Snow Showers: Slight
        '86': _('Snow Showers: Heavy'),               // Snow Showers: Heavy
        '95': _('Thunderstorm: Slight or Moderate'),  // Thunderstorm: Slight or Moderate (day or night)
        '96': _('Thunderstorm with slight hail'),     // Thunderstorm with slight hail (day or night)
        '99': _('Thunderstorm with heavy hail')      // Thunderstorm with heavy hail (day or night)
    };

    if (typeof textmap[text] !== 'undefined') {
      return textmap[text]; // Return the specifically translated version
    }
    return _(text); // Return the generally translated version
  }


}