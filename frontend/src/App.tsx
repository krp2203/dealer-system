import * as React from 'react';
import { useState } from 'react';
import DealerPicker from './components/DealerPicker';
import DealerMap from './components/DealerMap';
import './App.css';

function App() {
  const [selectedDealerNumber, setSelectedDealerNumber] = useState<string | null>(null);

  return (
    <div className="App">
      <header className="App-header">
        <h1>KPM Dealer System</h1>
      </header>
      <main>
        <DealerMap onDealerSelect={setSelectedDealerNumber} />
        <DealerPicker selectedDealer={selectedDealerNumber} />
      </main>
    </div>
  );
}

export default App;
