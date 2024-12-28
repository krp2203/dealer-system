import * as React from 'react';
import { useState } from 'react';
import { LoadScript } from '@react-google-maps/api';
import DealerPicker from './components/DealerPicker';
import DealerMap from './components/DealerMap';
import './App.css';

const GOOGLE_MAPS_API_KEY = 'AIzaSyBjFQbtxL4dTowDjMxB5UBtm4Z9Jf6UB5c';

function App() {
  const [selectedDealerNumber, setSelectedDealerNumber] = useState<string | null>(null);

  return (
    <div className="App">
      <header className="App-header">
        <h1>KPM Dealer System</h1>
      </header>
      <main>
        <LoadScript googleMapsApiKey={GOOGLE_MAPS_API_KEY}>
          <DealerMap onDealerSelect={setSelectedDealerNumber} />
        </LoadScript>
        <DealerPicker selectedDealer={selectedDealerNumber} />
      </main>
    </div>
  );
}

export default App;
