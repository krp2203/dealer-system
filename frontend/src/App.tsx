import * as React from 'react';
import { useState } from 'react';
import { LoadScript } from '@react-google-maps/api';
import DealerPicker from './components/DealerPicker';
import DealerMap from './components/DealerMap';
import './App.css';
import { Dealer } from './types/dealer';

const GOOGLE_MAPS_API_KEY = 'AIzaSyBjFQbtxL4dTowDjMxB5UBtm4Z9Jf6UB5c';

function App() {
  const [selectedDealerNumber, setSelectedDealerNumber] = useState<string | null>(null);
  const [filteredDealers, setFilteredDealers] = useState<Dealer[]>([]);

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
            onDealersFiltered={setFilteredDealers}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
