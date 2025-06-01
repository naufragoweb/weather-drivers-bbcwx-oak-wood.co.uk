# Refactoring National Weather Service driver

![BBCx Desklet](https://github.com/naufragoweb/weather-drivers-bbcwx-oak-wood.co.uk/blob/main/%20Z-%20Images/bbcx3.png)

![BBCx Desklet](https://github.com/naufragoweb/weather-drivers-bbcwx-oak-wood.co.uk/blob/main/%20Z-%20Images/bbcx4.png)

🔍 API Context:

The National Weather Service APIs are REST APIs that use hypermedia as a form of navigation (HATEOAS – Hypermedia as the Engine of Application State). The National Weather Service (NWS) API follows this pattern.

In this model, URL chains need to be called one by one, which is a problem for the driver structure, since some APIs contain important data for calling another API, requiring data synchronicity.

Another characteristic is the total lack of a standard in data distribution. Depending on the city and/or location, the data does not follow a pattern (for example, data every 1 hour, but when reading there is data every 6 hours, another with 2 hours between data, etc. The structure also differs between current, 1-hour, 12-hour and daily data, requiring changes in the way this data is called to assign it to the script objects.

🧩 Technical Challenges Encountered;

  * Asynchronous Dependency:
      The original format of desklet.js makes parallel asynchronous calls;
      This prevented the use of data from API1 (Location) as input for others APIs;

  * Fragmented Data:
      ** The APIs return additional information:
      	  ** First API return others APIS URLs ;
          ** Current conditions did not have complete data (use two APIs: current and 1 hour);
          ** Forecast data in two APIs (12 hour and daily) ;

      ** Premature assignment to objects caused:
          ** Data loss or overwritten during translations (desklet.js is not designed for this kind of out-of-sequence data assignment);
          ** Inconsistencies in rendering, mainly affecting the translation of out-of-sequence passages;

      ** User Experience:
    
          ** The emptyData → fetch → fill process created:
    
              ** Noticeable "no data screen" windows;
              ** Flickering in the interface;
              

💡 Implemented Solutions:

    1. Flow Control with Async/Await:
        ** Benefits:
              ** Ensures correct order of execution;
              ** Maintains compatibility with original desklet.js and wxbase.js

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

4. Correction in the assignment of data to objects by "object.assign" in the parse forecast function;

--------------------------------------------------------------------------------

Update 2025-05-31

* Reverted _mapIcon to previous version where comments were recovered;

* Created description list of texts provided in NWS API (_mapDescription);

--------------------------------------------------------------------------------

Update 2025-05-30

1. Code optimization:

* Replacing the load APIs functions with the _loadData and _loadDataWithParams functions;

* Script cleaning and standardization;

--------------------------------------------------------------------------------

Update 2025-05-29 (Refatored Code)

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

11. The entire function of determining the correct day for forecasts has been revised and simplified. Since the API does not provide well-organized data, the code section has been commented to clarify possible future interventions.

All these changes kept exactly the same same original functionality, but resulted in approximately 50% smaller code that is much easier to maintain and understand.

--------------------------------------------------------------------------------

Update 2025-05-28

* Adjustment in the _getDayName function for correct display of the days of the week of the forecasts.

--------------------------------------------------------------------------------

New driver (star changelogs)

* Insert 5 APIs to extract data;

* Extract forecast data for date and conditions to exibition correct data;

* refreshData in sincronous mode (async/await);

* Extract correct icons and weathertex to exibition;

--------------------------------------------------------------------------------
