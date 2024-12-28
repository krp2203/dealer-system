import * as React from 'react';
import { useState, useEffect } from 'react';
import { GoogleMap, LoadScript, Marker, InfoWindow } from '@react-google-maps/api';
import axios from 'axios';

interface DealerLocation {
    KPMDealerNumber: string;
    DealershipName: string;
    StreetAddress: string;
    City: string;
    State: string;
    ZipCode: string;
    lat?: number;
    lng?: number;
}

const DealerMap: React.FC<{
    onDealerSelect: (dealerNumber: string) => void;
}> = ({ onDealerSelect }) => {
    const [dealers, setDealers] = useState<DealerLocation[]>([]);
    const [selectedDealer, setSelectedDealer] = useState<DealerLocation | null>(null);
    const [mapCenter, setMapCenter] = useState({ lat: 39.8283, lng: -98.5795 }); // Center of USA

    useEffect(() => {
        const fetchDealers = async () => {
            try {
                const response = await axios.get('http://35.212.41.99:3002/api/dealers/coordinates');
                const dealersWithCoords = await Promise.all(response.data.map(async (dealer: DealerLocation) => {
                    const address = `${dealer.StreetAddress}, ${dealer.City}, ${dealer.State} ${dealer.ZipCode}`;
                    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=YOUR_GOOGLE_MAPS_API_KEY`;
                    
                    try {
                        const geocodeResponse = await axios.get(geocodeUrl);
                        if (geocodeResponse.data.results[0]) {
                            const { lat, lng } = geocodeResponse.data.results[0].geometry.location;
                            return { ...dealer, lat, lng };
                        }
                    } catch (error) {
                        console.error('Geocoding error:', error);
                    }
                    return dealer;
                }));
                
                setDealers(dealersWithCoords.filter(d => d.lat && d.lng));
            } catch (error) {
                console.error('Error fetching dealers:', error);
            }
        };

        fetchDealers();
    }, []);

    const mapStyles = {
        height: '600px',
        width: '100%'
    };

    return (
        <LoadScript googleMapsApiKey="YOUR_GOOGLE_MAPS_API_KEY">
            <GoogleMap
                mapContainerStyle={mapStyles}
                zoom={4}
                center={mapCenter}
            >
                {dealers.map(dealer => (
                    <Marker
                        key={dealer.KPMDealerNumber}
                        position={{ lat: dealer.lat!, lng: dealer.lng! }}
                        onClick={() => setSelectedDealer(dealer)}
                    />
                ))}

                {selectedDealer && (
                    <InfoWindow
                        position={{ lat: selectedDealer.lat!, lng: selectedDealer.lng! }}
                        onCloseClick={() => setSelectedDealer(null)}
                    >
                        <div>
                            <h3>{selectedDealer.DealershipName}</h3>
                            <p>{selectedDealer.StreetAddress}</p>
                            <p>{selectedDealer.City}, {selectedDealer.State} {selectedDealer.ZipCode}</p>
                            <button onClick={() => onDealerSelect(selectedDealer.KPMDealerNumber)}>
                                View Details
                            </button>
                        </div>
                    </InfoWindow>
                )}
            </GoogleMap>
        </LoadScript>
    );
};

export default DealerMap; 