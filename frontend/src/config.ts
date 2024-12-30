export const API_URL = process.env.NODE_ENV === 'development' 
    ? 'http://localhost:3002'
    : 'http://35.212.41.99:3002';

export const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || 'AIzaSyBjFQbtxL4dTowDjMxB5UBtm4Z9Jf6UB5c';

// Add debug logging
console.log('Current environment:', process.env.NODE_ENV);
console.log('API URL:', API_URL); 