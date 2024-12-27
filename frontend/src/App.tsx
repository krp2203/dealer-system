import React from 'react';
import DealerPicker from './components/DealerPicker.tsx';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>KPM Dealer System</h1>
      </header>
      <main>
        <DealerPicker />
      </main>
    </div>
  );
}

export default App;
