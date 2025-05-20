// BBC Weather Driver JSON API (Refatorado)

const UUID = 'bbcwx@oak-wood.co.uk';
const DESKLET_DIR = imports.ui.deskletManager.deskletMeta[UUID].path;
imports.searchPath.push(`${DESKLET_DIR}/drivers`);
const wxBase = imports.wxbase;
const GLib = imports.gi.GLib;
const Gettext = imports.gettext;

const SERVICE_STATUS_ERROR = wxBase.SERVICE_STATUS_ERROR;
const SERVICE_STATUS_OK = wxBase.SERVICE_STATUS_OK;
const SERVICE_STATUS_INIT = wxBase.SERVICE_STATUS_INIT;

const BBC_DRIVER_MAX_DAYS = 7; // Constant for the number of BBC days

Gettext.bindtextdomain(UUID, GLib.get_home_dir() + '/.local/share/locale');

function _(str) {
  return str ? Gettext.dgettext(UUID, str) || Gettext.dgettext('cinnamon', str) || str : '';
}

var Driver = class Driver extends wxBase.Driver {
  constructor(stationID) {
    super(stationID);
    this.maxDays = 7;
    this.capabilities.meta.region = false;

    this.drivertype = 'bbc';
    this.linkText = 'bbc.co.uk/weather';
    this.linkURL = 'https://www.bbc.com/weather/';
    this.locationURL = 'https://open.live.bbc.co.uk/locator/locations';
    this.baseURL = 'https://weather-broker-cdn.api.bbci.co.uk/en/';
    this.linkIcon = { 
      file: 'bbc', 
      width: 120, 
      height: 51 
    };

    this.locationID = '';
    this.localURL = '';
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
        this.data.cc.pressure_direction = '';
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
        for (let i = 0; i < BBC_DRIVER_MAX_DAYS; i++) {
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

      // Fetch API for location (meta data)
      const meta = await this._load_meta();
      if (!meta) {
        return this._showError(deskletObj, _('Failed to get location metadata'));
      } 
      if (this.latlon && !await this._parse_location(meta)) {
        return this._showError(deskletObj, _('Failed to process location data'));
      }

      // Enable location URL for user access
      this.linkURL = 'https://www.bbc.com/weather/' + this.locationID;

      // Fetch API for current conditions
      const current = await this._load_current();

      // Fetch API for forecast
      const forecast = await this._load_forecast();

      // Clears all old data objects
      this._emptyData();

      // Load data in objects to display
      await this._parse_data(meta, current, forecast, deskletObj);

      // Display data in the desklet
      deskletObj.displayMeta();
      deskletObj.displayCurrent();
      deskletObj.displayForecast();

    } catch (err) {
      global.logError(`BBC Driver refreshData error: ${err.message}`);
      this._showError(deskletObj, _('An unexpected error occurred: %s').format(err.message));
    }
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
      this.locationID = '';
    } else {
      this.latlon = null;
      this.locationID = this.stationID;
    }
    return true;
  }

  _getWeatherAsync(url, deskletObj) {
    return new Promise((resolve, reject) => {
      this._getWeather(url, (weather) => {
        if (weather) {
          resolve(weather);
        } else {
          // Assuming _getWeather calls callback with null/undefined on failure
          // Or you might need to check for a specific error indicator from _getWeather
          reject(e);
          this._showError(deskletObj, _('Failed to retrieve data from %s').format(url));
        }
      });
    });
  }

  async _load_meta() {
    this.localURL = this.latlon
      ? `${this.locationURL}?la=${this.latlon[0]}&lo=${this.latlon[1]}&format=json`
      : `${this.locationURL}/${this.locationID}?format=json`;
    try {
      const weather = await this._getWeatherAsync(this.localURL);
      const json = JSON.parse(weather);
      // Basic check for expected structure
      if (this.latlon && (!json.response || !json.response.results || !json.response.results.results || json.response.results.results.length === 0)) {
          this.data.status.meta = SERVICE_STATUS_ERROR;
          this.data.status.lasterror = _('Invalid location metadata response for lat/lon');
          return null;
      }
      if (this.locationID && (!json.response || !json.response.name)) {
          this.data.status.meta = SERVICE_STATUS_ERROR;
          this.data.status.lasterror = _('Invalid location metadata response for ID');
          return null;
      }
      this.data.status.meta = SERVICE_STATUS_OK;
      return json;
    } catch (err) {
      global.logError(`BBC Driver _load_meta error: ${err.message}`);
      this.data.status.meta = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('Error retrieving or parsing location metadata: %s').format(error.message);
      return null;
    }
  }

  async _load_current() {
    if (!this.locationID) {
      this.data.status.cc = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('Location ID not available');
      return null;
    }
    let currentURL = `${this.baseURL}observation/${this.locationID}`;
    try {
      // Use the new async helper
      let weather = await this._getWeatherAsync(currentURL);

      if (weather) {
        const json = JSON.parse(weather);
        // Basic check for expected structure
        if (!json.observations || json.observations.length === 0) {
          this.data.status.cc = SERVICE_STATUS_ERROR;
          this.data.status.lasterror = _('Invalid current conditions response');
          return null;
        }
      this.data.status.cc = SERVICE_STATUS_OK;
      return json;
      }
    } catch (err) {
      global.logError(`BBC Driver _load_current error: ${err.message}`);
      this.data.status.cc = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('Error retrieving current data: %s').format(err.message);
      return null;
    }
  }

  async _load_forecast() {
    if (!this.locationID) {
      this.data.status.forecast = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('Location ID not available');
      return null;
    }
    let daysURL = `${this.baseURL}forecast/aggregated/${this.locationID}`;
    try {
      // Use the new async helper
      let weather = await this._getWeatherAsync(daysURL);

      if (weather) {
        const json = JSON.parse(weather);
        // Basic check for expected structure
        if (!json.forecasts || json.forecasts.length === 0) {
          this.data.status.forecast = SERVICE_STATUS_ERROR;
          this.data.status.lasterror = _('Invalid forecast response');
          return null;
        }
        this.data.status.forecast = SERVICE_STATUS_OK;
        return json;
      }
    } catch (err) {
      global.logError(`BBC Driver _load_forecast error: ${err.message}`);
      this.data.status.forecast = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('Error retrieving forecast data: %s').format(err.message);
      return null;
    }
  }

  async _parse_location(meta) {
    const result = meta.response.results.results[0];
    if (!result.id) {
      this.data.status.meta = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('Missing location data');
      return false;
    }
    this.locationID = result.id;
    this.data.status.meta = SERVICE_STATUS_OK;
    return true;
  }

  async _parse_data(meta, current, forecast) {

    const loc = this.latlon ? meta.response.results.results[0] : meta.response;

    this.data.city = loc.name ?? '';
    this.data.country = loc.country ?? '';
    this.data.wgs84.lat = loc.lat ?? '';
    this.data.wgs84.lon = loc.lon ?? '';

    this.data.status.meta = SERVICE_STATUS_OK;
    if (!this.data.city || !this.data.country) {
      this.data.status.meta = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('Incomplete location metadata');
    }

    if (current.observations.length) {

      const obs = current.observations[0];
      const fobs = forecast.forecasts[0].detailed.reports[0];
      const isNight = forecast.isNight ?? false;

      this.data.cc.temperature = obs.temperature.C ?? '';
      this.data.cc.feelslike = fobs.feelsLikeTemperatureC ?? '';
      this.data.cc.wind_speed = obs.wind.windSpeedKph ?? '';
      this.data.cc.wind_direction = obs.wind.windDirectionAbbreviation ?? '';
      this.data.cc.humidity = obs.humidityPercent ?? fobs.humidity ?? '';
      this.data.cc.pressure = obs.pressureMb ?? fobs.pressure ?? '';
      this.data.cc.pressure_direction = _(obs.pressureDirection ?? fobs.pressureDirection ?? '');
      this.data.cc.visibility = _(obs.visibility ?? fobs.visibility ?? '');
      this.data.cc.weathertext = this._mapDescription(fobs.weatherTypeText ?? '');
      this.data.cc.icon = this._mapicon(String(fobs.weatherType ?? ''), isNight);
      this.data.cc.has_temp = this.data.cc.temperature !== '';

      this.data.status.cc = SERVICE_STATUS_OK;
    } else {
      this.data.status.cc = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('No current conditions data');
    }
    
    if (forecast?.forecasts?.length) {
      const isNight = forecast.isNight ?? false;

      for (let i = 0; i < this.maxDays; i++) {
        const day = this.data.days[i];
        const forecastDay = forecast.forecasts[i] || {};
        const sum = forecastDay.summary.report || {};
        const det = forecastDay.detailed.reports?.[0] || {};

        day.day = this._getDayName(i);
        day.maximum_temperature = sum.maxTempC ?? '';
        day.minimum_temperature = sum.minTempC ?? '';
        day.weathertext = this._mapDescription(sum.weatherTypeText || '');
        day.wind_direction = sum.windDirection ?? '';
        day.wind_speed = sum.windSpeedKph ?? '';
        day.icon = this._mapicon(String(sum.weatherType ?? ''), i === 0 ? isNight : false);
        day.humidity = det.humidity ?? '';
        day.pressure = det.pressure ?? '';
      }
      this.data.status.forecast = SERVICE_STATUS_OK;
    } else {
      this.data.status.forecast = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('No forecast data');
    }
  }

_getDayName(index) {
  // Use the abbreviations that correspond to the keys in desklet.js's this.daynames
  const dayNamesAbbr = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = new Date();
  const currentDay = today.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
  const dayIndex = (currentDay + index) % 7;
  return dayNamesAbbr[dayIndex]; // Returns the day abbreviation
}


  // Maps BBC weather type codes to icon names
  _mapicon(icon, isNight) {
    const icons = { 
      '1': '32', 
      '2': '30', 
      '3': '30', 
      '4': '23', 
      '5': '20', 
      '6': '20', 
      '7': '26', 
      '8': '26d', 
      '10': '11', 
      '11': '09', 
      '12': '11', 
      '14': '12', 
      '15': '12', 
      '17': '18', 
      '18': '18', 
      '20': '18', 
      '21': '18', 
      '23': '13', 
      '24': '13', 
      '26': '16', 
      '27': '16', 
      '29': '04', 
      '30': '04', 
      '31': '01', 
      '32': '20', 
      '33': '15', 
      '34': '08', 
      '35': '23', 
      '36': '26', 
      '39': '11' 
    };

    const nightIcons = { 
      '0': '31', 
      '1': '31', 
      '2': '29', 
      '3': '29', 
      '9': '11', 
      '13': '12', 
      '16': '18', 
      '19': '18', 
      '22': '46', 
      '25': '16', 
      '28': '04' 
    };

    let iconCode = 'na';

    const iconKey = icon ? icon.toString() : '';

    if (icon && (typeof icons[icon] !== 'undefined')) {
      iconCode = icons[icon];
    }
    //return isNight && nightIcons[icon] ? nightIcons[icon] : (icons[icon] || 'na');
    if (isNight && (typeof nightIcons[icon] !== 'undefined')) {
      iconCode = nightIcons[icon];
    }
    return iconCode;
  }

  // Provides specific translations for BBC weather text descriptions,
  // falling back to general translation.
  // Similar to _getWeatherTextFromYahooCode in wxbase.js
  _mapDescription(code) {
    if (!code) return '';
    const textmap = {
      // Keys are exact English strings from BBC API's weatherTypeText
      'Sandstorm'         : _('Sand Storm'),
      'Light Rain Showers': _('Light Rain Shower'),
      'Heavy Rain Showers': _('Heavy Rain Shower'),
      'Sleet Showers'     : _('Sleet Shower'),
      'Hail Showers'      : _('Hail Shower'),
      'Thundery Showers'  : _('Thundery Shower')
      // Add other specific mappings if necessary
    };

    if (typeof textmap[code] !== 'undefined') {
      return textmap[code]; // Return the specifically translated version
    }
    return _(code); // Return the generally translated version
  }
};
