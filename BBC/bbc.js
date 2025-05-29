// BBC Weather Driver JSON API - Refactored Version

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

const iconMappings = {
  day: {
    '1': '32', '2': '30', '3': '30', '4': '23', '5': '20', '6': '20', '7': '26', '8': '26d',
    '10': '11', '11': '09', '12': '11', '14': '12', '15': '12', '17': '18', '18': '18',
    '20': '18', '21': '18', '23': '13', '24': '13', '26': '16', '27': '16', '29': '04',
    '30': '04', '31': '01', '32': '20', '33': '15', '34': '08', '35': '23', '36': '26', '39': '11'
  },
  night: {
    '0': '31', '1': '31', '2': '29', '3': '29', '9': '11', '13': '12', '16': '18',
    '19': '18', '22': '46', '25': '16', '28': '04'
  }
};

const textMappings = {
  'Sandstorm': _('Sand Storm'),
  'Light Rain Showers': _('Light Rain Shower'),
  'Heavy Rain Showers': _('Heavy Rain Shower'),
  'Sleet Showers': _('Sleet Shower'),
  'Hail Showers': _('Hail Shower'),
  'Thundery Showers': _('Thundery Shower')
};

var Driver = class Driver extends wxBase.Driver {
  constructor(stationID) {
    super(stationID);
    this.maxDays = MAX_DAYS;
    this.capabilities.meta.region = false;
    
    this.drivertype = 'bbc';
    this.linkText = 'bbc.co.uk/weather';
    this.linkURL = 'https://www.bbc.com/weather/';
    this.locationURL = 'https://open.live.bbc.co.uk/locator/locations';
    this.baseURL = 'https://weather-broker-cdn.api.bbci.co.uk/en/';
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
    this.data.status = {
      cc: SERVICE_STATUS_INIT,
      forecast: SERVICE_STATUS_INIT,
      meta: SERVICE_STATUS_INIT,
      lasterror: false
    };

    try {
      if (!await this._verifyStation()) {
        return this._showError(deskletObj, _('Invalid Station ID'));
      }

      const meta = await this._loadMeta();
      if (!meta) return this._showError(deskletObj, _('Failed to get location metadata'));
      if (this.latlon && !await this._parseLocation(meta)) {
        return this._showError(deskletObj, _('Failed to process location data'));
      }

      const [current, forecast] = await Promise.all([
        this._loadCurrent(),
        this._loadForecast()
      ]);    

      this.linkURL = `https://www.bbc.com/weather/${this.locationID}`;
      this._emptyData();
      await this._parseData(meta, current, forecast, deskletObj);

      deskletObj.displayMeta();
      deskletObj.displayCurrent();
      deskletObj.displayForecast();
    } catch (err) {
      global.logError(`BBC Driver error: ${err.message}`);
      this._showError(deskletObj, _('An unexpected error occurred: %s').format(err.message));
    }
  }

  async _verifyStation() {
    if (!this.stationID || typeof this.stationID !== 'string') {
      this.data.status = { meta: SERVICE_STATUS_ERROR, lasterror: _('Station ID not defined') };
      return false;
    }
    
    if (/^\-?\d+(\.\d+)?,\-?\d+(\.\d+)?$/.test(this.stationID)) {
      this.latlon = this.stationID.split(',').map(Number);
      this.locationID = '';
    } else {
      this.latlon = null;
      this.locationID = this.stationID;
    }
    return true;
  }

  _getWeatherAsync(url, params = null) {
    return new Promise((resolve, reject) => {
      this._getWeather(url, weather => 
        weather ? resolve(weather) : reject(new Error(`Failed to retrieve data from ${url}`))
      , params);
    });
  }

  async _loadMeta() {
    try {
      const params = this.latlon ? { 
        la: this.latlon[0], 
        lo: this.latlon[1], 
        format: 'json' 
      } : { format: 'json' };
      
      this.localURL = this.latlon ? this.locationURL : `${this.locationURL}/${this.locationID}`;
      const json = JSON.parse(await this._getWeatherAsync(this.localURL, params));
      
      const isValid = this.latlon 
        ? json?.response?.results?.results?.length > 0
        : json?.response?.name;
      
      if (!isValid) {
        this.data.status = { 
          meta: SERVICE_STATUS_ERROR, 
          lasterror: _('Invalid location metadata response') 
        };
        return false;
      }
      
      this.data.status.meta = SERVICE_STATUS_OK;
      return json;
    } catch (err) {
      this.data.status = { 
        meta: SERVICE_STATUS_ERROR, 
        lasterror: _('Error retrieving metadata: %s').format(err.message) 
      };
      return false;
    }
  }

  async _loadCurrent() {
    if (!this.locationID) {
      this.data.status = { cc: SERVICE_STATUS_ERROR, lasterror: _('Location ID not available') };
      return false;
    }
    
    try {
      const json = JSON.parse(await this._getWeatherAsync(`${this.baseURL}observation/${this.locationID}`));
      
      if (!json?.observations?.length) {
        this.data.status = { cc: SERVICE_STATUS_ERROR, lasterror: _('Invalid current conditions') };
        return false;
      }
      
      this.data.status.cc = SERVICE_STATUS_OK;
      return json;
    } catch (err) {
      this.data.status = { 
        cc: SERVICE_STATUS_ERROR, 
        lasterror: _('Error retrieving current data: %s').format(err.message) 
      };
      return false;
    }
  }

  async _loadForecast() {
    if (!this.locationID) {
      this.data.status = { forecast: SERVICE_STATUS_ERROR, lasterror: _('Location ID not available') };
      return false;
    }
    
    try {
      const json = JSON.parse(await this._getWeatherAsync(`${this.baseURL}forecast/aggregated/${this.locationID}`));
      
      if (!json?.forecasts?.length) {
        this.data.status = { forecast: SERVICE_STATUS_ERROR, lasterror: _('Invalid forecast response') };
        return false;
      }
      
      this.data.status.forecast = SERVICE_STATUS_OK;
      return json;
    } catch (err) {
      this.data.status = { 
        forecast: SERVICE_STATUS_ERROR, 
        lasterror: _('Error retrieving forecast: %s').format(err.message) 
      };
      return false;
    }
  }

  async _parseLocation(meta) {
    this.locationID = meta.response.results.results[0].id;
    this.data.status.meta = SERVICE_STATUS_OK;
    return true;
  }

  async _parseData(meta, current, forecast, deskletObj) {
    try {
      const loc = this.latlon ? meta.response.results.results[0] : meta.response;
      
      Object.assign(this.data, {
        city: loc.name,
        country: loc.country,
        wgs84: { lat: loc.lat, lon: loc.lon },
        status: { meta: loc.name && loc.country ? SERVICE_STATUS_OK : {
          meta: SERVICE_STATUS_ERROR,
          lasterror: _('Incomplete location metadata')
        }}
      });

      if (current.observations.length) {
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
      } else {
        this.data.status.cc = SERVICE_STATUS_ERROR;
        this.data.status.lasterror = _('No current conditions data');
      }

      if (forecast.forecasts.length) {
        const isNight = forecast.isNight === true;
        const firstForecastDayReport = forecast.forecasts[0].summary.report;
        const firstForecastDayDetailed = forecast.forecasts[0].detailed.reports[0];
        const baseLocalDateString = firstForecastDayReport.localDate || firstForecastDayDetailed.localDate;
        const baseDayOfWeek = new Date(baseLocalDateString).getUTCDay();
        
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
      } else {
        this.data.status.forecast = SERVICE_STATUS_ERROR;
        this.data.status.lasterror = _('No forecast data');
      }
      return true;
    } catch (err) {
      this.data.status = {
        meta: SERVICE_STATUS_ERROR,
        cc: SERVICE_STATUS_ERROR,
        forecast: SERVICE_STATUS_ERROR,
        lasterror: _('Error parsing data: %s').format(err.message)
      };
      return false;
    }
  }

  _getDayName(i) {
    i = i === 7 ? 0 : i;
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return days[i] || (global.log(`Invalid day index: ${i}`) && "");
  }

  _mapIcon(icon, isNight) {
    return isNight && iconMappings.night[icon] 
      ? iconMappings.night[icon] 
      : iconMappings.day[icon] || 'na';
  }

  _mapDescription(code) {
    return code ? textMappings[code] || _(code) : '';
  }
};