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
const _ = str => str ? Gettext.dgettext(UUID, str) || Gettext.dgettext('cinnamon', str) || str : '';

var Driver = class Driver extends wxBase.Driver {
  constructor(stationID) {
    super(stationID);
    this.maxDays = MAX_DAYS;
    this.capabilities.meta.region = false;
    
    this.drivertype = 'bbc';
    this.linkText = 'bbc.co.uk/weather';
    this.linkURL = 'https://www.bbc.com/weather/';
    this.locationURL = 'https://open.live.bbc.co.uk/locator/locations';
    this._baseURL = 'https://weather-broker-cdn.api.bbci.co.uk/en';
    this.linkIcon = { file: 'bbc', width: 120, height: 51 };
    
    this.locationID = '';
    this.localURL = '';
  }

  _emptyData() {
    this.data = {
      city: '',
      country: '',
      wgs84: { lat: '', lon: '' },
      cc: {
        feelslike: '', has_temp: false, humidity: '', icon: '', pressure: '',
        pressure_direction: '', temperature: '', visibility: '', weathertext: '',
        wind_direction: '', wind_speed: ''
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

      if (!await this._verifyStation()) {
        return this._showError(deskletObj, _('Invalid Station ID'));
      }

      let params = this._params();

      let metaURL = this.latlon ? `${this.locationURL}` : `${this.locationURL}/${this.locationID}`;
      const meta = await this._loadDataWithParams(metaURL, 'meta', params);
      if (!meta) return this._showError(deskletObj, _('Failed to get location metadata'));
      if (this.latlon && !await this._parseLocation(meta)) return this._showError(deskletObj, _('Failed to process location data'));
     
      let observationURL = `${this._baseURL}/observation/${this.locationID}`;
      let forecastURL = `${this._baseURL}/forecast/aggregated/${this.locationID}`;
      const [current, forecast] = await Promise.all([
        this._loadData(observationURL, 'observations'),
        this._loadData(forecastURL, 'forecasts')
      ]); 
      
      if (!current || !forecast) {
        return this._showError(deskletObj, _('Failed to load some weather data'));
      }

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
      this._showError(deskletObj, _('An unexpected error occurred: %s').format(err.message));
    }
  }

  _params() {
    return this.latlon ? { 
        la: this.latlon[0], 
        lo: this.latlon[1], 
        format: 'json' 
      } : { format: 'json' };
  }

  async _verifyStation() {
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

  _getWeatherAsync(url, params = null) {
    return new Promise((resolve, reject) => {
      this._getWeather(url, weather => 
        weather ? resolve(weather) : reject(new Error(`Failed to retrieve data from ${url}`))
      , params);
    });
  }

  async _loadDataWithParams(URL, API, params) {
    try {
      const rawData = await this._getWeatherAsync(URL, params);
      const json = JSON.parse(rawData);
      return json.response ? json : false;
    } catch (err) {
      global.logError(`BBC: Error loading data ${API}: ${err.message}`);
      return false;
    }
  }  

  async _loadData(URL, API) {
    try {
      const rawData = await this._getWeatherAsync(URL);
      const json = JSON.parse(rawData);
      return json ? json : false;
    } catch (err) {
      global.logError(`BBC: Error loading data ${API}: ${err.message}`);
      return false;
    }
  }  

  async _parseLocation(meta) {
    this.locationID = meta.response.results.results[0].id;
    this.data.status.meta = SERVICE_STATUS_OK;
    return true;
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
      this.data.status.lasterror = _('Error processing meta data');
    }
    return true;
  }

  async _parseCurrentData(current, forecast) {
    try {
      const obs = current.observations[0];
        const fobs = forecast.forecasts[0].detailed.reports[0];
        const isNight = forecast.isNight === true;
        
        Object.assign(this.data.cc, {
          temperature: obs.temperature.C,
          feelslike: fobs.feelsLikeTemperatureC,
          wind_speed: obs.wind.windSpeedKph,
          wind_direction: obs.wind.windDirectionAbbreviation,
          humidity: obs.humidityPercent || fobs.humidity,
          pressure: obs.pressureMb || fobs.pressure,
          pressure_direction: _(obs.pressureDirection || fobs.pressureDirection),
          visibility: _(obs.visibility || fobs.visibility),
          weathertext: this._mapDescription(fobs.weatherTypeText),
          icon: this._mapIcon(String(fobs.weatherType), isNight),
          has_temp: true
        });
      this.data.status.cc = SERVICE_STATUS_OK;
    } catch (err) {
      this.data.status.cc = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('Error processing current data: %s').format(err.message);
    }
    return true;
  } 

  async _parseForecastData(forecast) {
    try {
        const isNight = forecast.isNight === true;
        const localDate = forecast.forecasts[0].summary.report.localDate || 
        forecast.forecasts[0].detailed.reports[0].localDate;
        const baseDayOfWeek = new Date(localDate).getUTCDay();
        
        forecast.forecasts.slice(0, this.maxDays).forEach((dayData, i) => {
          const sum = dayData.summary.report;
          const det = dayData.detailed.reports[0];
          
          Object.assign(this.data.days[i], {
            day: this._getDayName((baseDayOfWeek + i) % 7),
            maximum_temperature: sum.maxTempC,
            minimum_temperature: sum.minTempC,
            weathertext: this._mapDescription(sum.weatherTypeText),
            wind_direction: sum.windDirection,
            wind_speed: sum.windSpeedKph,
            icon: this._mapIcon(String(sum.weatherType), i === 0 ? isNight : false),
            humidity: det.humidity,
            pressure: det.pressure
          });
        });
      this.data.status.forecast = SERVICE_STATUS_OK;
    } catch (err) {
      this.data.status.forecast = SERVICE_STATUS_ERROR;
      this.data.status.lasterror = _('Error processing forecast data: %s').format(err.message);
    }
    return true;
  }

  _getDayName(i) {
    i = i === 7 ? 0 : i;
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return days[i] || (global.log(`Invalid day index: ${i}`) && "");
  }

  _mapIcon(icon, isNight) {
    const iconMappings = {
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

    return isNight && iconMappings.night[icon] 
      ? iconMappings.night[icon] 
      : iconMappings.day[icon] || 'na';
  }

  _mapDescription(code) {
    const textMappings = {
      'Sandstorm'         : _('Sand Storm'),
      'Light Rain Showers': _('Light Rain Shower'),
      'Heavy Rain Showers': _('Heavy Rain Shower'),
      'Sleet Showers'     : _('Sleet Shower'),
      'Hail Showers'      : _('Hail Shower'),
      'Thundery Showers'  : _('Thundery Shower')
    };
    return code ? textMappings[code] || _(code) : '';
  }
};