<div align="center">

# Google Weather API

</div>

<div align="center">

![BBCwx Desklet](https://github.com/naufragoweb/weather-drivers-bbcwx-oak-wood.co.uk/blob/main/%20Z-%20Images/google-weather1.png)

</div>

<div align="center">

![BBCwx Desklet](https://github.com/naufragoweb/weather-drivers-bbcwx-oak-wood.co.uk/blob/main/%20Z-%20Images/google-weather2.png)

</div>

<div align="center">


## Features:


</div>

- Displaying current weather conditions;
- 7-day weather forecast display;
- Translation into over 55 languages;

## Requirements:

* Requires Google for Developers apikey;
* To request your apikey, you must validate your personal data by inserting a valid credit/debit card from a banking institution. Not all institutions return personal data, which can cause errors. For example, in my country, I tried to use a Mastercard card from a payment institution that simply did not work. At another institution, the same card worked with my Mastercard debit card. I was not charged any amount during this procedure. Please note that this is a debit card.

## Limitation:

* The Google Weather API has a limit of 10,000 free requests per month. Above this amount, Google charges a price "X" for "X" additional requests. The desklet updates the information for at least 10 minutes between updates (I recommend every 15 minutes because the current data is updated every 15 minutes). If the desklet makes an update every 10 minutes, there will be 2 requests for each update, totaling 8,928 requests in a month of 31 days, within the volume of free requests. So there is no way to use this desklet to exceed the free limit of your apikey.

## Important Notes:

* The google.js driver WILL NOT WORK without changing the desklet.js and settings-schema.json files. If you want to test, you can open the file and modify it to work in place of another driver, as shown in the image below:

![Google code](https://github.com/naufragoweb/weather-drivers-bbcwx-oak-wood.co.uk/blob/main/%20Z-%20Images/google-weather3.png)

for this:

![Google Code](https://github.com/naufragoweb/weather-drivers-bbcwx-oak-wood.co.uk/blob/main/%20Z-%20Images/google-weather4.png)

* After this change, place the file in the drivers folder ( ~/home/.local/share/cinnamon/desklet/bbcwx@oak-wood.co.uk/5.4/drivers), restart Cinnamon and in the desklet configuration screen choose "Open Wheater Map", add your apikey and put your location. Enjoy!

* To display the Google icon, copy the google.png file and paste it into ( ~/home/.local/share/cinnamon/desklet/bbcwx@oak-wood.co.uk/5.4/icons/colorful) and restart Cinnamon.

<div align="center">

![Google image](https://github.com/naufragoweb/weather-drivers-bbcwx-oak-wood.co.uk/blob/main/Google_Weather/google.png)

</div>

* In the near future I will change desklet.js and settings-schema.json and include the Google API.

----------------------------------------------------------------------------------
# CHANGELOG:

Update 2025-06-07

* New Driver start;
* New translation system with free Google API for words, phrases or terms that the Desklet translation system does not translate, in addition to translating alerts and error messages.

-----------------------------------------------------------------------------------
