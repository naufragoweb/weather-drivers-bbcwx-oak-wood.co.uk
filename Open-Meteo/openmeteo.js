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

function _(str) {
  return str ? Gettext.dgettext(UUID, str) || Gettext.dgettext('cinnamon', str) || str : '';
}

var Driver = class Driver extends wxBase.Driver {
  // initialize the driver
  constructor(stationID, version) {
    super(stationID);
    this.version = version;
    
    this.capabilities.cc.visibility = false;

    this.drivertype = 'Open-Meteo';
    this.maxDays = MAX_DAYS;
    this.linkText = 'Open-Meteo';
    this._baseURL = `https://api.open-meteo.com/v1/forecast`;
    this._locationURL = `https://nominatim.openstreetmap.org/reverse`;
    this.linkIcon = { file: 'openmeteo', width: 120, height: 36};

    this.userAgent = `(${UUID} ${this.version}; Contact: https://github.com/linuxmint/cinnamon-spices-desklets/issues)`;

    this.latitude = '';
    this.longitude = '';
  }

  _emptyData() {
    this.data = {
      city: '', country: '', region: '',
      wgs84: { lat: '', lon: '' },
      cc: {
        feelslike: '', has_temp: false, humidity: '', icon: '', pressure: '',
        temperature: '', weathertext: '', wind_direction: '', wind_speed: ''
      },
      days: Array(MAX_DAYS).fill().map(() => ({
        day: '', humidity: '', icon: '', maximum_temperature: '', minimum_temperature: '',
        pressure: '', weathertext: '', wind_direction: '', wind_speed: ''
      })),
      status: {}
    };
  }

  async refreshData(deskletObj) {
    try {
      this.data.status = {
        cc: SERVICE_STATUS_INIT, 
        forecast: SERVICE_STATUS_INIT, 
        meta: SERVICE_STATUS_INIT, 
        lasterror: false
      };

      if (!await this._verifyStation()) {
        return this._showError(deskletObj, _('Invalid Station ID'));
      }

      const forecast = await this._loadDataWithParams(this._baseURL, 'forecast', this._paramsData());
      if (!forecast) return this._showError(deskletObj, _('Failed to load forecast data'));
      await this._parseLocation(forecast);

      const meta = await this._loadDataWithParams(this._locationURL, 'meta', this._paramsGeocode());
      if (!meta) return this._showError(deskletObj, _('Failed to load meta data'));

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
      this._showError(deskletObj, _('An unexpected error occurred: %s').format(err.message));
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

  async _verifyStation() {
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
      this._getWeather(url, weather => 
        weather ? resolve(weather) : reject(new Error(`Failed to retrieve data from ${url}`))
      , params, this.userAgent);
    });
  }

  async _loadDataWithParams(URL, API, params) {
    try {
      const rawData = await this._getWeatherAsync(URL, params);
      const json = JSON.parse(rawData);
      return json ? json : false;
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
      this.data.status.lasterror = _('Incomplete location data: %s').format(err.message);
    }
    return true;
  }

  async _parseMetaData(meta, forecast) {
    try {
      this.data.city = meta.address.city;
      //this.data.region = meta.address.state;
      this.data.country = meta.address.country;
      this.data.wgs84 = {
        lat: forecast.latitude,
        lon: forecast.longitude
      };
      this.data.status.meta = SERVICE_STATUS_OK;
    } catch (err) {
      global.logError(`Error parsing meta data: ${err.message}`);
      this.data.status.meta = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('Incomplete meta data: %s').format(err.message);
    }
    return true;
  }

  async _parseCurrentData(forecast) {
    try {
      const isDay = forecast.current.is_day;
      let current = forecast.current;

      this.data.cc.has_temp = true;
      this.data.cc.temperature = current.temperature_2m;
      this.data.cc.feelslike = current.apparent_temperature;
      this.data.cc.wind_speed = current.wind_speed_10m;
      this.data.cc.wind_direction = this.compassDirection(current.wind_direction_10m);
      this.data.cc.humidity = current.relative_humidity_2m;
      this.data.cc.pressure = current.surface_pressure;
      this.data.cc.weathertext = this._mapDescription(String(current.weather_code, isDay));
      this.data.cc.icon = this._mapIcon(String(current.weather_code, isDay));

      this.data.status.cc = SERVICE_STATUS_OK;
    } catch (err) {
      global.logError(`Error parsing current data: ${err.message}`);
      this.data.status.cc = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('Incomplete current data: %s').format(err.message);
    }
    return true;
  }

  async _parseForecastData(forecast) {
    try {
      const isDay = forecast.current.is_day;
      let forecasts = forecast.daily;
      for (let i = 0; i < forecasts.time.length; i++) {
        let day = new Object();
        day.day = this._getDayName(new Date(forecasts.time[i]).getUTCDay());

        day.maximum_temperature = forecasts.temperature_2m_max[i];
        day.minimum_temperature = forecasts.temperature_2m_min[i];
        day.wind_speed = forecasts.wind_speed_10m_max[i];
        day.wind_direction = this.compassDirection(forecasts.wind_direction_10m_dominant[i]);
        day.weathertext = this._mapDescription(String(forecasts.weather_code[i], i === 0 ? isDay : true));
        day.icon = this._mapIcon(String(forecasts.weather_code[i], i === 0 ? isDay : true));
        day.humidity = forecasts.relative_humidity_2m_mean[i];
        day.pressure = forecasts.surface_pressure_mean[i];

        this.data.days[i] = day;
      }
      this.data.status.forecast = SERVICE_STATUS_OK;
    } catch (err) {
      global.logError(`Error parsing forecast data: ${err.message}`);
      this.data.status.lasterror = _('Incomplete forecast data: %s').format(err.message);
      return false;
    }
    return true;
  }

  _getDayName(i) {
     i = i === 7 ? 0 : i;
     const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
     return days[i] || (global.log(`Invalid day index: ${i}`) && "");
  }

  _mapIcon(icon, isDay) {
    
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
      '1': '33',   // Mainly Clear
      '2': '29',   // Partly cloudy
      '80': '45',  // Rain Showers: Slight 
      '81': '47',  // Rain Showers: Moderate
      '85': '46',  // Snow Showers: Slight 
      '86': '46'   // Snow Showers: Heavy 
    };

    let iconCode = 'na';
    const iconKey = icon ? icon.toString() : '';

    if (icon && (typeof icons[icon] !== 'undefined')) {
    iconCode = icons[icon];
    }

    if (!isDay === '0' && (typeof nightIcons[icon] !== 'undefined')) {
    iconCode = nightIcons[icon];
    }
    return iconCode;
  }

    _mapDescription(text, isDay = 0) {
      if (!text) return '';
      const textmap = {
        '0': isDay ? _('Clear Sky') : _('Sunny'),     // Clear sky
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