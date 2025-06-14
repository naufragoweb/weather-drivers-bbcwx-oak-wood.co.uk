# Implementing BBCwx Weather Driver

![BBCx Desklet](https://github.com/naufragoweb/weather-drivers-bbcwx-oak-wood.co.uk/blob/main/%20Z-%20Images/bbcx1.png)

![BBCx Desklet](https://github.com/naufragoweb/weather-drivers-bbcwx-oak-wood.co.uk/blob/main/%20Z-%20Images/bbcx2.png)

Challenges and Solutions:

🔍 API Context:

The BBCwx Weather Service uses 3 complementary APIs:

    * Location API: Provides geonameID (essential for other APIs), city name, country and geographic coordinates
    * Current Conditions API: Real-time weather data
    * Forecasts API: Future and complementary data

⚠️ Critical issue: The Location API is mandatory for coordinate queries (lat/long), as it provides the ID needed to access the other APIs, as well as important data about the location.

🧩 Technical Challenges Encountered;

  * Asynchronous Dependency:
      The original format of desklet.js makes parallel asynchronous calls;
      This prevented the use of data from API1 (Location) as input for APIs2 and 3;

  * Fragmented Data:
      ** The APIs return additional information:
          - Current conditions (API2) did not have complete data;
          - Locations (API1) and Forecasts (API3) contained missing information in API2;

      ** Premature assignment to objects caused:
          - Data loss or overwritten during translations (desklet.js is not designed for this kind of out-of-sequence data assignment);
          - Inconsistencies in rendering, mainly affecting the translation of out-of-sequence passages;

      ** User Experience:
    
          - The emptyData → fetch → fill process created:
    
              -- Noticeable "empty screen" windows;
              -- Flickering in the interface;
              

💡 Implemented Solutions:

    1. Flow Control with Async/Await:
        ** Benefits:
              -- Ensures correct order of execution;
              -- Maintains compatibility with original desklet.js and wxbase.js

    2. Data Processing Reengineering:
        ** Phase 1: Collection and parsing (without attribution);
        ** Phase 2: Unification of supplementary data;
        ** Phase 3: Unique attribution to objects;
        ** Improvement: Eliminated inconsistencies in final data;

    3. Update Cycle Optimization
        ** emptyData moved to after new data is fetched;

    * Result:
        ** Total reduction in error screen time (between updates);
        ** Smooth transition between updates;
        
    4. Adjustment in the correct identification of forecast days by changing the _getDayName function.

👨‍💻 Lessons Learned

*** Asynchronicity requires careful planning in dependency chains;

*** Additional data must be processed before rendering;

*** User experience can be improved with small adjustments to the flow.

--------------------------------------------------------------------------------

# CHANGELOG:

Update 2025-06-10

1. Improvements in _tradutor():

    - Inserted Promise.all for simultaneous translation by the _tradutor() function;

2. Modification of the _mapDescription() function:

    - Modification in the text output handling of the _mapDescription() function to correctly determine if the text exists in the textMap constant and forward the text to the translation function _ ;

3. Code cleaning and standardization of error messages;

---------------------------------------------------------------------------------

Update 2025-06-09

1. Improvements in function _():

    - Remove redundantly created Driver instance;
    - Stores the current active driver instance (var Driver) to avoid creating multiple unnecessary instances;

2. Insert new local _getDayName:

    - Insert new local _getDayName function to adapt to the original wxbase.js loop when obtaining data from forecast objects correctly;

3. Modification to _mapDescription:

    - Modified the text output for the _ function;
    - Removed the call to the _ function directly in the text to be called only at the output of _mapDescription;

--------------------------------------------------------------------------------

Update 2025-06-08

1. Changes in _verifyStation:

    - Code optimization;
    - Bug removal when user used geoname ID as location and did not display location data;
    - Optimized line-wrap error messages for display and translation;

2. Inserting a language map for translation:

    - Language map for unofficial Google Translation API (model 2022q2);

3. Modification (optimization) to API loading functions:

    - Removed _loadDataWithParams function;
    - Modification to the _loadData function to accept URLs with and without parameters;

4. Optimization of the forecast data parse function:

    - Return to the original loop function to search for data on days;
    - Modified the call to _getDayName to use the original function from wxbase.js;
    - Modification to the "insight" variable removing redundancy;

5. Removing local _getDayName;

6. Modification in _mapIcon:

    - isNight now correctly calls night icons for current conditions and day0;

7. Insertion of unofficial Google translation API;

    - Inserting User Agent for the translation API;
    - Modification of the _ function to add one more translation method:
        * The script searches for a translation in the desklet's own translation system;
        * If it doesn't find it, it searches in Cinnamon Desktop;
        * If it doesn't find it, it searches in the Google translation API;
        * If it returns an error, then it returns the original text;
    - Modification in almost all error alerts that return in this.data.status.error so that the translation system works on them as well.

8. Small optimizations, cleaning and organization in the code;

--------------------------------------------------------------------------------

Update 2025-06-01

1. Removed bug that displayed data when user input was null or wrong after already acquiring data:

    - Inserted in _verifyStation the _emptyData function to clear data previously obtained when the user changes or deletes the stationID data;
  
2. Modified _verifyStation function:

    - Modified the latitude, longitude check allowing the use of space after the comma in the regex;
  ![Regex verifyStation](https://github.com/naufragoweb/weather-drivers-bbcwx-oak-wood.co.uk/blob/main/%20Z-%20Images/stationID3.png)

    - Added verification of entered coordinates (if null or within valid geographic coordinate values);
  ![LatLon verification](https://github.com/naufragoweb/weather-drivers-bbcwx-oak-wood.co.uk/blob/main/%20Z-%20Images/stationID4.png)

    - Added compliance check for geonameID (7 or 8 characters);
  ![GeonameID verification](https://github.com/naufragoweb/weather-drivers-bbcwx-oak-wood.co.uk/blob/main/%20Z-%20Images/stationID5.png)
  
3. New messages to inform the user of errors when entering coordinates:

* "Error: Location is empty or not definded.";

![error verifyStation](https://github.com/naufragoweb/weather-drivers-bbcwx-oak-wood.co.uk/blob/main/%20Z-%20Images/stationID0.png)

* "Error: Invalid Location format. Expected: latitude,longitude or a valid code location;

![error verifyStation](https://github.com/naufragoweb/weather-drivers-bbcwx-oak-wood.co.uk/blob/main/%20Z-%20Images/stationID6.png)

* "Error: Invalid latitude or longitude values in Location "

![error verifyStation](https://github.com/naufragoweb/weather-drivers-bbcwx-oak-wood.co.uk/blob/main/%20Z-%20Images/stationID2.png)

--------------------------------------------------------------------------------

Update 2025-06-03

* (Correction) Small adjustments to the display of icons;

--------------------------------------------------------------------------------

Update 2025-06-02

* (Correction) Adjust the display of icons 34 and 36 to their respective desklet icon;

--------------------------------------------------------------------------------

Update 2025-05-31

* Reverted _mapIcon to previous version where comments were recovered.

--------------------------------------------------------------------------------

Update 2025-05-30

1. Code optimization:

* Insert _params() function to _loadMeta();

* Replacing the _loadCurrent and _loadForecast functions with the _loadData function;

* Replacing the _loadMeta function with the _loadDataWithParams function;

* Script cleaning and standardization;

--------------------------------------------------------------------------------

Update 2025-05-29 (Refactored Code)

I will detail all the changes I made to make the code simpler and more compact, while maintaining the same functionality:
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

* _getWeatherAsync(): Made more concise:

![getWeatherAsync](https://github.com/naufragoweb/weather-drivers-bbcwx-oak-wood.co.uk/blob/main/%20Z-%20Images/image4.png)

* _mapIcon() and _mapDescription(): Simplified using mapping objects:

![Mapping Objects](https://github.com/naufragoweb/weather-drivers-bbcwx-oak-wood.co.uk/blob/main/%20Z-%20Images/image5.png)

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

* Eliminated similar methods (_params and _params0) by consolidating them into conditional logic;

* Replaced for loops with array methods like slice() and fill();

7. Consistent Naming

* Standardized method names to camelCase (_parseLocation instead of _parse_location);

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

11. Fixed name of days.

12. Modification to the async/await function to use Promises All to speed up the process of assigning data to display objects.

* Separating data parsing into separate functions to run together.

![Promisse All](https://github.com/naufragoweb/weather-drivers-bbcwx-oak-wood.co.uk/blob/main/%20Z-%20Images/image10.png)

All these changes kept exactly the same same original functionality, but resulted in approximately 30% smaller code that is much easier to maintain and understand.

--------------------------------------------------------------------------------

Update 2025-05-23

* New modification to the expression of the day.day object: changes the date locale from "day0" to "localDate" with fallback to "detailed" if "summary" fails.

* Minor adjustments and code cleanup

--------------------------------------------------------------------------------

Update 2025-05-22

* Modified the _getDayName function so that the days of the week are calculated from the local date in issueDate in the API;

* Removed Nullish operators from the script to simplify and adapt to the wxbase.js standard;

* Added "params" function for incorporating parameters into URL by wxbase.js;

* minor adjustments, code cleanup;

--------------------------------------------------------------------------------

Update 2025-05-20

* Adjustment in the correct identification of forecast days by changing the _getDayName function.

--------------------------------------------------------------------------------

Update: 2025-05-19

* Code cleaning

* Refactoring to wxbase.js patterns;

* Naming functions, variables and expressions according to wxbase.js;

* Cleaning up error log calls;

* emptyData function setting:

** Removing this.data.status and initializing in refreshData to create the object outside of emptyData;

* Minor layout adjustments and adaptation to the wxbase.js standard;

* Added status confirmation in _load_data to confirm success of data assigned to this.data.meta

--------------------------------------------------------------------------------

Updates and fix: Start 2025-05-18

* Script fetches data in JSON format;

* Script returns 7 days of forecast (actually it returns 14, but the desklet has the limit set at 7, the current day + 6 days of forecast);

* Script fetches data from 3 different APIs: Location, Observations and Forecasts;

* Allows insertion of geonameID and geographic coordinates (example: -4.05,39.66);

* Anticipated and synchronized fetching of APIs and parsing before assigning to objects;

* Delay in cleaning declared objects...Now the script only cleans objects when the API data is already parsed and ready for replacement, reducing the delay in refreshing the data;

* Adjustment of icons and weathertexts according to the data extracted from the APIs with numbering and nomenclature;

* Adjustment of nomenclature according to the desklet translation;

* Adjustment of the _emptyData function:

  ** Use the constant BBC_DRIVER_MAX_DAYS to ensure the array is always the correct size for BBC, regardless of the value of this.maxDays during the call to super() in the constructor.This ensures that the array is always the correct size, regardless of the original this.maxDays value in wxbase. This avoids the 'day is undefined' error when starting the script;
  
* Compatibility adjustments with wxbase.js (assigning functions similar to the base driver);

* Creating a BBC logo for display: created in GIMP with Gill Sans fonts (the script is already adapted, just insert it into the icons/colorful folder);

* Add params function to choose URL options;

--------------------------------------------------------------------------------




