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

interface GeocodeResult {
    geometry: {
        location: {
            lat: number;
            lng: number;
        };
    };
}

interface GeocodeResponse {
    results: GeocodeResult[];
    status: string;
}

const GOOGLE_MAPS_API_KEY = 'AIzaSyCKWHs3ywhjQ7kfakEuv0dfxeuCMvzRrZs';

const DealerMap: React.FC<{
    onDealerSelect: (dealerNumber: string) => void;
}> = ({ onDealerSelect }) => {
    const [dealers, setDealers] = useState<DealerLocation[]>([]);
    const [selectedDealer, setSelectedDealer] = useState<DealerLocation | null>(null);
    const [mapCenter] = useState({ lat: 37.5407, lng: -77.4360 }); // Center on Virginia
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const mapStyles = {
        height: '400px',
        width: '100%'
    };

    useEffect(() => {
        const fetchDealers = async () => {
            try {
                console.log('Fetching dealers...');
                const response = await axios.get<DealerLocation[]>('http://35.212.41.99:3002/api/dealers/coordinates');
                console.log('Received dealers:', response.data);

                if (!response.data || response.data.length === 0) {
                    setError('No dealers found');
                    setLoading(false);
                    return;
                }

                const dealersWithCoords = await Promise.all(
                    response.data.map(async (dealer) => {
                        const address = `${dealer.StreetAddress}, ${dealer.City}, ${dealer.State} ${dealer.ZipCode}`;
                        console.log('Geocoding:', address);
                        
                        try {
                            const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`;
                            const geocodeResponse = await axios.get<GeocodeResponse>(geocodeUrl);
                            
                            if (geocodeResponse.data.results?.[0]?.geometry?.location) {
                                const { lat, lng } = geocodeResponse.data.results[0].geometry.location;
                                return { ...dealer, lat, lng };
                            }
                        } catch (error) {
                            console.error('Geocoding error:', error);
                        }
                        return dealer;
                    })
                );

                const validDealers = dealersWithCoords.filter((d): d is DealerLocation & { lat: number; lng: number } => 
                    typeof d.lat === 'number' && typeof d.lng === 'number'
                );
                console.log('Dealers with coordinates:', validDealers);

                if (validDealers.length === 0) {
                    setError('No dealers found with valid coordinates');
                } else {
                    setDealers(validDealers);
                }
                setLoading(false);
            } catch (error) {
                console.error('Error fetching dealers:', error);
                setError('Failed to fetch dealers');
                setLoading(false);
            }
        };

        fetchDealers();
    }, []);

    if (loading) return <div>Loading dealers...</div>;
    if (error) return <div>Error: {error}</div>;
    if (dealers.length === 0) return <div>No dealers found</div>;

    return (
        <div className="map-container">
            <LoadScript googleMapsApiKey={GOOGLE_MAPS_API_KEY}>
                <GoogleMap
                    mapContainerStyle={mapStyles}
                    zoom={7}
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