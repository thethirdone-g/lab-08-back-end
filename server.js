'use strict'
// These variables create the connection to the dependencies.
const express = require('express');
const superagent = require('superagent');
const cors = require('cors');
const pg = require('pg');
const app = express();

// Allows us to use the .env file
require('dotenv').config();
console.log('test');

// Setting up database by instantiating a new client, pointing it at our database, then connecting it to the database.
const client = new pg.Client(process.env.DATABASE_URL);
client.connect();

// Error handling for the database
client.on('error', err => console.error(err));

// Tells express to use 'cors' for cross-origin resource sharing
app.use(cors());



// assigns the PORT variable to equal the port declared in the .env file for our local server.  It also allows heroku to assign it's own port number.
const PORT = process.env.PORT;

// The following app.get() will call the correct helper function to retrieve the API information.
app.get('/location', getLocation); //google API
app.get('/weather', getWeather); //darkskies API
app.get('/yelp', getRestaurants); // yelp API
app.get('/movies', getMovies); // the movie database API
// app.get('/meetups', getMeetup); // the MeetUp API
app.get('/trails', getTrails); // the Hiking API

// Tells the server to start listening to the PORT, and console.logs to tell us it's on.
app.listen(PORT, () => console.log(`Listening on ${PORT}`));

// Clear the results for a location if they are stale
// THis is dynamic because it is able to accept a specific table and city as arguments
function deleteByLocationId(table, city) {
  const SQL = `DELETE from ${table} WHERE location_id=${city};`;
  return client.query(SQL);
}

// CONSTRUCTORS BELOW //

// SQL
function Location(query, res) {
  this.search_query = query;
  this.formatted_query = res.body.results[0].formatted_address;
  this.latitude = res.body.results[0].geometry.location.lat;
  this.longitude = res.body.results[0].geometry.location.lng;
  this.created_at = Date.now();
}

Location.lookupLocation = (location) => {
  const SQL = `SELECT * FROM locations WHERE search_query=$1;`;
  const values = [location.query];

  // Check for this location based on the user's search query
  return client.query(SQL, values)
    .then(result => {
      // Does it exist in the database? Pass the result to the .cacheHit method
      // Remember: the result object contains an array named "rows" which contains objects, one per row from the databse. Even when there is only one.
      if(result.rowCount > 0) {
        location.cacheHit(result.rows[0]);
        // If not in the database
      } else {
        location.cacheMiss();
      }
    })
    .catch(console.error);
}

// Adding a save method so that we can save each location instance
// Extra verification -- ON CONFLICT DO NOTHING will ensure it's really not there.
// RETURNING id -- ensures that the id is returned from the query when we create the instance
// Unless we specifically ask for it, an INSERT statement will not give us the id back
Location.prototype = {
  save: function() {
    // $1 matches this.search_query, $2 matches this.formatted_query, $3 matches latitude, and $4 matches longitude
    const SQL = `INSERT INTO locations (search_query, formatted_query, latitude, longitude) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING id;`;
    const values = [this.search_query, this.formatted_query, this.latitude, this.longitude];

    // Now that we have the id, we can add it to the location instance
    // Why does this matter? We need to include the id when we send the location object to the client so that the other APIs can use it to reference the locations table
    // For example, the weather object need to have a foreign key of location_id, and this id is the source of that value
    return client.query(SQL, values)
      .then(result => {
        this.id = result.rows[0].id;
        return this;
      })
  }
}



// Constructor function for Darksky API
function WeatherResult(weather) {
  this.time = new Date(weather.time * 1000).toString().slice(0, 15);
  this.forecast = weather.summary;
}

//Constructor function for Yelp API
function RestaurantResult(restaurant) {
  this.name = restaurant.name;
  this.image_url = restaurant.image_url;
  this.price = restaurant.price;
  this.rating = restaurant.rating;
  this.url = restaurant.url;
}

//Constructor function for The Movie Database API
function MovieResults(movie) {
  this.title = movie.title;
  this.overview = movie.overview;
  this.average_votes = movie.vote_average;
  this.total_votes = movie.vote_count;
  this.image_url = `https://image.tmdb.org/t/p/w500${movie.poster_path}`;
  this.popularity = movie.popularity;
  this.released_on = movie.release_date;
}

//Constructor function for Hiking API
function HikingResult(hike) {
  this.name = hike.name;
  this.location = hike.location;
  this.length = hike.length;
  this.stars = hike.stars;
  this.star_votes = hike.star_votes;
  this.summary = hike.summary;
  this.trail_url = hike.trail_url;
  this.conditions = hike.conditions;
  this.condition_date = hike.condition_date;
  this.condition_time = hike.condition_time;
}

// Google helper function refactored prior to lab start.
function getLocation(request, response) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${request.query.data}&key=${process.env.GOOGLE_API_KEY}`;
  return superagent.get(url)
    .then(location => {
      response.send(new LocationResult(request.query.data, location));
    })
    .catch(error => processError(error, response));
}

// Contructor function for Google API
function LocationResult(search, location) {
  this.search_query = search;
  this.formatted_query = location.body.results[0].formatted_address;
  this.latitude = location.body.results[0].geometry.location.lat;
  this.longitude = location.body.results[0].geometry.location.lng;
}

// Location helper function to check the database for location information
function getLocation(request, response) {
  Location.lookupLocation({
    tableName: Location.tableName,

    query : request.query.data,

    // If the location exists, send it
    cacheHit: function(result) {
      response.send(result);
    },

    // If the location doesn't exist, request it from the API, save it in database, and send it to the client
    cacheMiss: function() {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${this.query}&key=${process.env.GOOGLE_API_KEY}`;

      return superagent.get(url)
        .then(result => {
          const location = new Location(this.query, result);
          // We need a .then() becasue we want to wait for the id to be returned before sending the location object to the client
          // If we semd the location object back before we receive the id from the database, the other APIs will not know what teh request.query.data.id is and it will not be undefined
          location.save()
            .then(location => response.send(location));
        })
        .catch(error => processError(error));
    }
  })
}

function singleLookup(options) {
  const SQL = `SELECT * FROM ${options.tableName} WHERE location_id=$1;`;
  const values = [options.location];

  client.query(SQL, values)
    .then(result => {
      // If there is more than one record in the database, pass the array of objects as an argument to the cacheHit method
      if(result.rowCount > 0) {
        options.cacheHit(result);
      } else {
        options.cacheMiss();
      }
    })
    .catch(error => processError(error));
}


// Weather helper function
function getWeather(request, response) {
  const url = `https://api.darksky.net/forecast/${process.env.DARK_SKY_API_KEY}/${request.query.data.latitude},${request.query.data.longitude}`;
  return superagent.get(url)
    .then(result => {
      let weatherData = [];
      weatherData = result.body.daily.data.map((weather) => {
        return new WeatherResult(weather)
      })
      response.send(weatherData);
    })
    .catch(error => processError(error, response));
}

// Restraurant helper function
function getRestaurants(request, response) {
  const url = `https://api.yelp.com/v3/businesses/search?location=${request.query.data.search_query}`;

  return superagent.get(url)
    .set('Authorization', `Bearer ${process.env.YELP_API_KEY}`)
    .then(result => {
      let yelpData = [];
      yelpData = result.body.businesses.map((restaurant) => {
        return new RestaurantResult(restaurant);
      })
      response.send(yelpData);
    })
    .catch(error => processError(error, response));
}

//Movies helper function
function getMovies(request, response) {
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.TMDB_APIv3_KEY}&query=${request.query.data.search_query}`
  return superagent.get(url)
    .then(result => {
      let movieData = [];
      movieData = result.body.results.map(movie => {
        return new MovieResults(movie);
      })
      response.send(movieData);
    })
    .catch(error => processError(error, response));
}

//Hiking helper function
function getTrails(request, response) {
  const url =`https://www.hikingproject.com/data/get-trails?lat=${request.query.data.latitude}&lon=${request.query.data.longitude}&maxDistance=10&key=${process.env.HIKING_API_KEY}`
  return superagent.get(url)
    .then(result => {
      let hikingData = [];
      // console.log('getTrails',result.body);
      hikingData = result.body.trails.map(trail => {
        return new HikingResult(trail);
      })
      response.send(hikingData);
    })
    .catch(error => processError(error, response));
}


// Error handeling helper function
function processError(err, res) {
  console.error(err);
  if (res) res.status(500).send('Sorry, something went wrong');
}
