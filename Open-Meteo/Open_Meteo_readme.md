# Refatored Open-Meteo Driver

![BBCx Desklet](https://github.com/naufragoweb/weather-drivers-bbcwx-oak-wood.co.uk/blob/main/%20Z-%20Images/bbcx7.png)

![BBCx Desklet](https://github.com/naufragoweb/weather-drivers-bbcwx-oak-wood.co.uk/blob/main/%20Z-%20Images/bbcx8.png)

🔍 API Context:

    The Open-Meteo API does not provide location data. 
    A new API has been introduced to fetch location data reported by the 
    Open-Meteo API.

🧩 Technical Challenges Encountered;

1. Location data (meta) not provided by Open-Meteo;

2. Name of days in future forecast incorrectly designated;

3. Weather condition icons not correctly assigned to the list of icons in the system;

4. Part of the code for describing weather conditions together with the display icons;

💡 Implemented Solutions:

1. ~~Addition of new API (https://geocode.xyz/) to provide location data (meta) to the driver;~~ Replacing the Geocode API with the Nominatim API (Open Street Map)

2. Flow Control with Async/Await:
   
       * Benefits:
       
       Ensures correct order of execution:
           For the new location API, latitude and longitude data is required, which may be different 
           from the data entered by the user, avoiding errors in assigning 
           the wrong location in relation to the data provided. The 
           synchronicity of the execution allows the data to be waited for
           and used correctly, regardless of errors, delays or any other 
           incident in the search for data via the Internet.
       
       Maintains compatibility with original desklet.js and wxbase.js

3. Code restructuring. Separation of functions with grouping of sections, for cleaner and easier to maintain code;

4. Update Cycle Optimization
   
       emptyData moved to after new data is fetched;

5. New getDayName function based on the date provided in the API to determine the day of the week corresponding to the displayed data.

6. Separation of texts and icons, each in its respective function (mapicon and mapDescription) to organize the code.

--------------------------------------------------------------------------------

# CHANGELOG:

Update 2025-06-10

1. Improvements in _tradutor():

    - Inserted Promise.all for simultaneous translation by the _tradutor() function;

2. Code cleaning and standardization of error messages;

----------------------------------------------------------------------------------

Update 2025-06-09

1. Inserting a language map for translation:

    - Language map for unofficial Google Translation API (model 2022q2);

2. Optimization of the forecast data parse function:

    - Return to the original loop function to search for data on days;
    - Modified the call to _getDayName to use the original function from wxbase.js;

3. Modify local _getDayName;

    - Modification of the function to adapt to the original wxbase.js loop when obtaining data from forecast objects;

4. Modification to _mapDescription:

    - Modified the text output for the _ function;
    - Removed the call to the _ function directly in the text to be called only at the output of _mapDescription;

5. Insertion of unofficial Google translation API;

    - Modification of the _ function to add one more translation method:
        * The script searches for a translation in the desklet's own translation system;
        * If it doesn't find it, it searches in Cinnamon Desktop;
        * If it doesn't find it, it searches in the Google translation API;
        * If it returns an error, then it returns the original text;
    - Modification in almost all error alerts that return in this.data.status.error so that the translation system works on them as well.
    - Stores the current active driver instance (var Driver) to avoid creating multiple unnecessary instances.

6. Small optimizations, cleaning and organization in the code;

--------------------------------------------------------------------------------

Update 2025-06-01

1. Removed bug that displayed data when user input was null or wrong after already acquiring data:

* Inserted in _verifyStation the _emptyData function to clear data previously obtained when the user changes or deletes the stationID data;

2. Modified _verifyStation function:

* Modified the latitude, longitude check allowing the use of space after the comma in the regex;

![Regex verifyStation](https://github.com/naufragoweb/weather-drivers-bbcwx-oak-wood.co.uk/blob/main/%20Z-%20Images/stationID3.png)

* Added verification of entered coordinates (if null or within valid geographic coordinate values);

![LatLon verification](https://github.com/naufragoweb/weather-drivers-bbcwx-oak-wood.co.uk/blob/main/%20Z-%20Images/stationID4.png)

3. New messages to inform the user of errors when entering coordinates:

* "Error: Location is empty or not definded.";

![error verifyStation](https://github.com/naufragoweb/weather-drivers-bbcwx-oak-wood.co.uk/blob/main/%20Z-%20Images/stationID0.png)

* "Error: Invalid Location format. Expected: latitude,longitude (e.g. 40.71,-74.01)";

![error verifyStation](https://github.com/naufragoweb/weather-drivers-bbcwx-oak-wood.co.uk/blob/main/%20Z-%20Images/stationID1.png)

* "Error: Invalid latitude or longitude values in Location "

![error verifyStation](https://github.com/naufragoweb/weather-drivers-bbcwx-oak-wood.co.uk/blob/main/%20Z-%20Images/stationID2.png)

4. Included verification of data extracted from the API;

![load data verify](https://github.com/naufragoweb/weather-drivers-bbcwx-oak-wood.co.uk/blob/main/%20Z-%20Images/loadDataWithParams01.png)

5. (Correction) Re-insert object.assing for assigning display objects in parse functions;

6. (Correction) Fix for _mapIcon function to determine day and night icons for current conditions and day0 in forecast;

--------------------------------------------------------------------------------

Update 2025-05-31 (Refatored Code):

1. Organization and Constants

* Consolidation of constants: I grouped all the constants at the beginning of the file for better visibility:

![Consolidation of constants](https://github.com/naufragoweb/weather-drivers-bbcwx-oak-wood.co.uk/blob/main/%20Z-%20Images/image1.png)

* Centralized mappings: I created constant objects for icon and text mappings:

![Centralized mappings](https://github.com/naufragoweb/weather-drivers-bbcwx-oak-wood.co.uk/blob/main/%20Z-%20Images/image2.png)

2. Simplifying Methods

* _emptyData(): I replaced the manual initialization with a more compact structure:

![emptyData](https://github.com/naufragoweb/weather-drivers-bbcwx-oak-wood.co.uk/blob/main/%20Z-%20Images/image3.png)

* refreshData():
  
    I used Promise.all to load the data in parallel;
  
    I simplified the error handling logic;
    
3. Helper Improvements

* _getWeatherAsync(): Made more concise and insert Agent User:

![getWeatherAsync](https://github.com/naufragoweb/weather-drivers-bbcwx-oak-wood.co.uk/blob/main/%20Z-%20Images/image11.png)

4. Simplified Status Handling
* I've consolidated status updates into more straightforward operations:

![Status Handling](https://github.com/naufragoweb/weather-drivers-bbcwx-oak-wood.co.uk/blob/main/%20Z-%20Images/image6.png)

5. ES6+ (ECMAScript 6) Syntax Improvements

* Destructuring assignment:

![Destructuring assignment](https://github.com/naufragoweb/weather-drivers-bbcwx-oak-wood.co.uk/blob/main/%20Z-%20Images/image7.png)

* Ternary operators:

![Ternary operator](https://github.com/naufragoweb/weather-drivers-bbcwx-oak-wood.co.uk/blob/main/%20Z-%20Images/image8.png)

* Optional chaining:

![Chaining](https://github.com/naufragoweb/weather-drivers-bbcwx-oak-wood.co.uk/blob/main/%20Z-%20Images/image9.png)

6. Reduced Repetitive Code

* Replaced for loops with array methods like slice() and fill();

* Removed similar methods ( APIs load ) by consolidating them into conditional logic;

![APIs load](https://github.com/naufragoweb/weather-drivers-bbcwx-oak-wood.co.uk/blob/main/%20Z-%20Images/image12.png)

7. Consistent Naming

* Standardized method names to camelCase (_parselocation instead of _parse_location);

* Kept the underscore prefix convention for private methods;

8. Unified Error Handling

* Created a consistent pattern for error handling across all asynchronous operations;

* Simplified updating of error state;

9. Operational Efficiency
* Parallelized requests with Promise.all;

* Reduced unnecessary copy and assignment operations;
10. Improved Readability
* Shortened complex conditional blocks;

* Used Object.assign for multiple assignments;

* Removed obvious comments (code explains itself)
11. Removed the Geocode API to use the Open Street Map Nominatim API:
* Limit of 1 call per second;

* Removed delay function in API call;
12. Separation of params for each API:
* When the getWeather function is called, each corresponding params is loaded;
13. Separation of the parse of objects (current, meta and forecast) into distinct functions:
* Concurrent execution between wall functions with Promise All;

![Concurrent parse](https://github.com/naufragoweb/weather-drivers-bbcwx-oak-wood.co.uk/blob/main/%20Z-%20Images/image13.png)

14. Insert new icon (openmeteo.png) for insertion in /5.4/icons/colorful.

--------------------------------------------------------------------------------

Update 2025-05-27

* Insert time delimiter for calls to geocode.xyz API (only allows one call per minute)

--------------------------------------------------------------------------------

Update 2025-05-22 - Start new script

* Add new API to location data;

* Refatored code;

* Control flow with async/await;

* Inclusion of missing data;

* minor adjustments and code cleanup.

--------------------------------------------------------------------------------
