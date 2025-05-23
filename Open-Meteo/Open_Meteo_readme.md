Refatored Open-Meteo Driver

🔍 API Context:

	The Open-Meteo API does not provide location data. A new API has been introduced to fetch location data reported by the Open-Meteo API.
	
	
🧩 Technical Challenges Encountered;

1. Location data (meta) not provided by Open-Meteo;

2. Name of days in future forecast incorrectly designated;

3. Weather condition icons not correctly assigned to the list of icons in the system;

4. Part of the code for describing weather conditions together with the display icons;


💡 Implemented Solutions:

1. Addition of new API (https://geocode.xyz/) to provide location data (meta) to the driver;

2.  Flow Control with Async/Await:

        ** Benefits:
        
              -- Ensures correct order of execution --> For the new location API, latitude and longitude data is required, which may be different from the data entered by the user, avoiding errors in assigning the wrong location in relation to the data provided. The synchronicity of the execution allows the data to be waited for and used correctly, regardless of errors, delays or any other incident in the search for data via the Internet.
              
              -- Maintains compatibility with original desklet.js and wxbase.js
              
3. Code restructuring. Separation of functions with grouping of sections, for cleaner and easier to maintain code;

4. Update Cycle Optimization

        ** emptyData moved to after new data is fetched;
        
5.  New getDayName function based on the date provided in the API to determine the day of the week corresponding to the displayed data.

6. Separation of texts and icons, each in its respective function (mapicon and mapDescription) to organize the code.

--------------------------------------------------------------------------------

Update 2025-05-22 - Start new script

* Add new API to location data;

* Refatored code;

* Control flow with async/await;

* Inclusion of missing data;

* minor adjustments and code cleanup.

--------------------------------------------------------------------------------


