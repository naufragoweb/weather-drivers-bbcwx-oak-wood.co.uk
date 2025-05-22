Open Weather Map Free refactored

Problems found:

* incomplete data display
* incorrect data display in future days forecast

⚠️  Critical problem: incorrect data extraction by the previous script. The API delivers data in blocks format every 3 hours, from the current day to the 4th subsequent day. The previous script did not consider this feature, randomly removing data that did not belong to the reported day.

🧩 Technical Challenges Encountered;

  * Asynchronous Dependency:
      Asynchronous execution can cause errors, depending on factors such as crashes, slow internet connection, internet server congestion, etc.
      
  * Incorrect data displayed:
  	  The script did not extract the data according to the correct days... Since the data is delivered in 3-hour blocks, each day has 8 blocks of data, for each 3 hours
  	  
  * Language Map:
	  Adjusted to support all languages ​​directly via Open Weather Map
	  
💡 Implemented Solutions:

  1- To predict the days correctly, the script separated the data from the current day (day0) to be displayed as they are updated (every 3 hours), while days 1 to 4 were grouped and processed, taking minimums and maximums from the data to be displayed correctly on each day. In addition, blocks are grouped by date, preventing the error of assigning data incorrectly;

  2- Adding all missing languages ​​to the API call parameter to return in the user's language;
  
  3- Flow Control with Async/Await:
        ** Benefits:
        
              * Ensures correct order of execution;
              
              * Maintains compatibility with original desklet.js and wxbase.js
              
  4- Update Cycle Optimization
  
        ** emptyData moved to after new data is fetched;

    * Result:
    
        ** Total reduction in blank screen time (between updates);
        
        ** Smooth transition between updates;
        
--------------------------------------------------------------------------------

Update 2025-05-21

* Refactored code;

* Adding all missing languages ​​to the API call parameter to return in the user's language;

* Flow Control with Async/Await; 

* Add logo image;

* Organization of general script functions;

* Import Data function modified for better system fluidity (eliminate flickering, error in screen);

* New parse function to correct extracted data:

	--Day 0 Treated Separately:

		* Uses only the first block (json.list[0]);

		* Does not perform any data aggregation;

	--Days 1-4 with Strict Grouping:

		* Completely ignores blocks from day0

		* Groups by day difference from the date of the first block;

		* Keeps all aggregation logic (minimums, maximums, etc.)

	--Simplified Logic:

		* Eliminates unnecessary checks;

	--Consistency with Existing Structure:

		* Keeps original field names;

		* Uses _getDayName() and compassDirection() as in current implementations;
		
--------------------------------------------------------------------------------

Update: 2025-05-22

* Modification of the display of the weather condition of the forecast for future days:

	* Determine the dominant condition of the day according to relevance (getWeatherPriority function);
	
	* Fallback to the noon icon in case of failure to determine the priority icon;
	
* Translation of script notes into English;


