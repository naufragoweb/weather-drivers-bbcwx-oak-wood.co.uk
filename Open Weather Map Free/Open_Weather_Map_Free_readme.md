# Open Weather Map Free refactored

![BBCx Desklet](https://github.com/naufragoweb/weather-drivers-bbcwx-oak-wood.co.uk/blob/main/%20Z-%20Images/bbcx5.png)

![BBCx Desklet](https://github.com/naufragoweb/weather-drivers-bbcwx-oak-wood.co.uk/blob/main/%20Z-%20Images/bbcx6.png)

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

Update 2025-05-31

*  Reverted _mapIcon and _getWeatherPriority to previous version where comments were recovered.

--------------------------------------------------------------------------------

Update 2025-05-30 (Refatored Code):

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

13. * Replacing the load APIs functions with the _loadData and _loadDataWithParams functions;

All these changes kept exactly the same same original functionality, but resulted in approximately 30% smaller code that is much easier to maintain and understand.

--------------------------------------------------------------------------------



Update: 2025-05-22

* Modification of the display of the weather condition of the forecast for future days:

	* Determine the dominant condition of the day according to relevance (getWeatherPriority function);
	
	* Fallback to the noon icon in case of failure to determine the priority icon;
	
* Translation of script notes into English;

* Adjust icon dimensions;

* Adjustment in minimum request time for data updates (this.minTTL);

* Small adjustments;

--------------------------------------------------------------------------------

Update 2025-05-27

* Change in the way of determining the correct day of the week for forecasts.

--------------------------------------------------------------------------------


Update 2025-05-21 - Initial logs:

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


