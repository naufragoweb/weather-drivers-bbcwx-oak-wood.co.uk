Implementing BBC Weather Driver:


Challenges and Solutions:

🔍 API Context:

The BBC Weather Service uses 3 complementary APIs:

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
        ** Total reduction in blank screen time (between updates);
        ** Smooth transition between updates;
        
    4. Adjustment in the correct identification of forecast days by changing the _getDayName function.

👨‍💻 Lessons Learned

*** Asynchronicity requires careful planning in dependency chains;

*** Additional data must be processed before rendering;

*** User experience can be improved with small adjustments to the flow.

----------------------------------------------------------------------------

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

Update 2025-05-20

* Adjustment in the correct identification of forecast days by changing the _getDayName function.

--------------------------------------------------------------------------------

