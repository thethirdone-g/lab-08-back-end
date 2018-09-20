'use strict'
// These variables create the connection to the dependencies.
const express = require('express');
const superagent = require('superagent');
const cors = require('cors');
const app = express();

// Tells express to use 'cors' for cross-origin resource sharing
app.use(cors());

// Allows us to use the .env file
require('dotenv').config();

// assigns the PORT variable to equal the port declared in the .env file for our local server.  It also allows heroku to assign it's own port number.
const PORT = process.env.PORT;

// The following app.get() will call the correct helper function to retrieve the API information.
app.get('/location', getLocation); //google API
app.get('/weather', getWeather); //darkskies API
app.get('/yelp', getRestaurants); // yelp API
app.get('/movies', getMovies); // the movie database API

// Tells the server to start listening to the PORT, and console.logs to tell us it's on.
app.listen(PORT, () => console.log(`Listening on ${PORT}`));

// CONSTRUCTORS BELOW //

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

// Error handeling helper function
function processError(err, res) {
  console.error(err);
  if (res) res.status(500).send('Sorry, something went wrong');
}