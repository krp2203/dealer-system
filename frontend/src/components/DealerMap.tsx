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

interface GeocodeResponse {
    results: Array<{
        geometry: {
            location: {
                lat: number;
                lng: number;
            };
        };
    }>;
}

const GOOGLE_MAPS_API_KEY = 'AIzaSyCKWHs3ywhjQ7kfakEuv0dfxeuCMvzRrZs';

const DealerMap: React.FC<{
    onDealerSelect: (dealerNumber: string) => void;
}> = ({ onDealerSelect }) => {
    const [dealers, setDealers] = useState<DealerLocation[]>([]);
    const [selectedDealer, setSelectedDealer] = useState<DealerLocation | null>(null);
    const [mapCenter] = useState({ lat: 39.8283, lng: -98.5795 });
    const [error, setError] = useState<string | null>(null);

    const mapStyles = {
        height: '400px',
        width: '100%'
    };

    useEffect(() => {
        const fetchDealers = async () => {
            try {
                console.log('Fetching dealers for map...');
                const response = await axios.get<DealerLocation[]>('http://35.212.41.99:3002/api/dealers/coordinates');
                console.log('Received dealers:', response.data);

                if (!response.data || response.data.length === 0) {
                    setError('No dealers found');
                    return;
                }

                const dealersWithCoords = await Promise.all(
                    response.data
                        .filter(dealer => 
                            dealer.StreetAddress && 
                            dealer.City && 
                            dealer.State && 
                            dealer.ZipCode
                        )
                        .map(async (dealer: DealerLocation) => {
                            const address = `${dealer.StreetAddress}, ${dealer.City}, ${dealer.State} ${dealer.ZipCode}`;
                            console.log('Geocoding address:', address);
                            
                            try {
                                const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`;
                                const geocodeResponse = await axios.get<GeocodeResponse>(geocodeUrl);
                                console.log('Geocode response:', geocodeResponse.data);

                                if (geocodeResponse.data.results && geocodeResponse.data.results[0]) {
                                    const { lat, lng } = geocodeResponse.data.results[0].geometry.location;
                                    console.log('Got coordinates for', dealer.DealershipName, ':', { lat, lng });
                                    return { ...dealer, lat, lng };
                                } else {
                                    console.warn('No coordinates found for address:', address);
                                    return dealer;
                                }
                            } catch (error) {
                                console.error('Geocoding error for address:', address, error);
                                return dealer;
                            }
                        })
                );

                const validDealers = dealersWithCoords.filter((d): d is DealerLocation & { lat: number; lng: number } => 
                    d.lat !== undefined && d.lng !== undefined
                );

                console.log('Final dealers with coordinates:', validDealers);
                setDealers(validDealers);

                if (validDealers.length === 0) {
                    setError('No dealers found with valid coordinates');
                }
            } catch (error) {
                console.error('Error fetching dealers:', error);
                setError('Failed to fetch dealers');
            }
        };

        fetchDealers();
    }, []);

    if (error) {
        return <div>Error: {error}</div>;
    }

    return (
        <div className="map-container">
            <LoadScript googleMapsApiKey={GOOGLE_MAPS_API_KEY}>
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
        </div>
    );
};

export default DealerMap; 