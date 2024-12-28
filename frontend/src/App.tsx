import * as React from 'react';
import { useState, useEffect } from 'react';
import { LoadScript } from '@react-google-maps/api';
import DealerPicker from './components/DealerPicker';
import DealerMap from './components/DealerMap';
import './App.css';
import { Dealer } from './types/dealer';
import axios from 'axios';

const GOOGLE_MAPS_API_KEY = 'AIzaSyBjFQbtxL4dTowDjMxB5UBtm4Z9Jf6UB5c';
const API_URL = 'http://35.212.41.99:3002';
const CACHE_KEY = 'dealerCoordinates';

function App() {
  const [selectedDealerNumber, setSelectedDealerNumber] = useState<string | null>(null);
  const [allDealers, setAllDealers] = useState<Dealer[]>([]);
  const [filteredDealers, setFilteredDealers] = useState<Dealer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDealers = async () => {
      try {
        // Try to get cached coordinates
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const { data } = JSON.parse(cached);
          if (data && data.length > 0) {
            setAllDealers(data);
            setFilteredDealers(data);
            setLoading(false);
            return;
          }
        }

        // Fetch dealers with coordinates
        const response = await axios.get<Dealer[]>(`${API_URL}/api/dealers`);
        if (response.data) {
          // Log the first few dealers
          console.log('Received dealers from API:', response.data.slice(0, 5).map(d => ({
            name: d.DealershipName,
            salesman: d.SalesmanName,
            productLines: d.ProductLines,
            fullDealer: d
          })));
          
          setAllDealers(response.data);
          setFilteredDealers(response.data);
          
          // Cache the results
          localStorage.setItem(CACHE_KEY, JSON.stringify({
            data: response.data,
            timestamp: Date.now()
          }));
        }
      } catch (error) {
        console.error('Error fetching dealers:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDealers();
  }, []);

  if (loading) return <div>Loading dealers...</div>;

  return (
    <div className="App">
      <header className="App-header">
        <h1>KPM Dealer System</h1>
      </header>
      <div className="main-content">
        <div className="map-section">
          <LoadScript googleMapsApiKey={GOOGLE_MAPS_API_KEY}>
            <DealerMap 
              onDealerSelect={setSelectedDealerNumber}
              dealers={filteredDealers}
            />
          </LoadScript>
        </div>
        <div className="details-section">
          <DealerPicker 
            selectedDealer={selectedDealerNumber}
            dealers={allDealers}
            onDealersFiltered={setFilteredDealers}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
