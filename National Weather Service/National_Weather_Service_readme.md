Refactoring National Weather Service driver

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

New driver (star changelogs)

* Insert 5 APIs to extract data;

* Extract forecast data for date and conditions to exibition correct data;

* refreshData in sincronous mode (async/await);

* Extract correct icons and weathertex to exibition;

--------------------------------------------------------------------------------
