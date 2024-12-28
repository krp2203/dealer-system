import * as React from 'react';
import { useState, useEffect } from 'react';
import { GoogleMap, Marker, InfoWindow } from '@react-google-maps/api';
import axios from 'axios';
import { MarkerProps } from '@react-google-maps/api';

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
    error_message?: string;
}

const GOOGLE_MAPS_API_KEY = 'AIzaSyBjFQbtxL4dTowDjMxB5UBtm4Z9Jf6UB5c';

const CACHE_KEY = 'dealerCoordinates';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

async function getCoordinates(address: string): Promise<{ lat: number; lng: number } | null> {
    try {
        // Add a small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 200));
        
        const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`;
        const response = await axios.get<GeocodeResponse>(geocodeUrl);
        
        console.log('Geocoding response for', address, ':', {
            status: response.data.status,
            error: response.data.error_message,
            results: response.data.results?.length || 0
        });

        if (response.data.status === 'OK' && response.data.results?.[0]?.geometry?.location) {
            const location = response.data.results[0].geometry.location;
            console.log(`Found coordinates for ${address}:`, location);
            return location;
        }

        // Try with just city and state
        const [, city, stateZip] = address.split(',').map(s => s.trim());
        if (city && stateZip) {
            const simpleAddress = `${city}, ${stateZip}`;
            console.log('Trying simpler address:', simpleAddress);
            
            const fallbackResponse = await axios.get<GeocodeResponse>(
                `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(simpleAddress)}&key=${GOOGLE_MAPS_API_KEY}`
            );

            console.log('Fallback response for', simpleAddress, ':', {
                status: fallbackResponse.data.status,
                error: fallbackResponse.data.error_message,
                results: fallbackResponse.data.results?.length || 0
            });
            
            if (fallbackResponse.data.status === 'OK' && fallbackResponse.data.results?.[0]?.geometry?.location) {
                const location = fallbackResponse.data.results[0].geometry.location;
                console.log(`Found coordinates for ${simpleAddress}:`, location);
                return location;
            }
        }

        console.warn(`No coordinates found for ${address}`);
        return null;
    } catch (error) {
        // Simpler error logging without type checking
        console.error(`Geocoding error for ${address}:`, {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        return null;
    }
}

const DealerMap: React.FC<{
    onDealerSelect: (dealerNumber: string) => void;
}> = ({ onDealerSelect }) => {
    const [dealers, setDealers] = useState<DealerLocation[]>([]);
    const [selectedDealerId, setSelectedDealerId] = useState<string | null>(null);
    const [mapCenter] = useState({ lat: 38.5, lng: -77.5 });
    const [mapZoom] = useState(8);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [hoveredDealer, setHoveredDealer] = useState<DealerLocation | null>(null);
    const [isHoveringInfoWindow, setIsHoveringInfoWindow] = useState(false);

    const mapStyles = {
        height: '100%',
        width: '100%',
        minHeight: '600px'
    };

    useEffect(() => {
        const fetchDealers = async () => {
            try {
                // Try to get cached coordinates
                const cached = localStorage.getItem(CACHE_KEY);
                if (cached) {
                    const { data } = JSON.parse(cached);
                    console.log('Found cached dealers:', data);
                    if (data && data.length > 0) {
                        setDealers(data);
                        setLoading(false);
                        return;
                    }
                }

                console.log('Fetching dealers from API...');
                const response = await axios.get<DealerLocation[]>('http://35.212.41.99:3002/api/dealers/coordinates');
                console.log('API Response:', response.data);

                if (!response.data || !Array.isArray(response.data)) {
                    throw new Error('Invalid data received');
                }

                // Log the coordinates
                const validDealers = response.data.filter(d => {
                    const isValid = d.lat && d.lng;
                    if (!isValid) {
                        console.log('Invalid dealer:', d);
                    }
                    return isValid;
                });

                console.log('Valid dealers with coordinates:', validDealers);
                setDealers(validDealers);
                setLoading(false);

                // Cache the results
                localStorage.setItem(CACHE_KEY, JSON.stringify({ data: validDealers }));
            } catch (error) {
                console.error('Error fetching dealers:', error);
                setError('Failed to fetch dealers');
                setLoading(false);
            }
        };

        fetchDealers();
    }, []);

    useEffect(() => {
        const selectedDealerData = dealers.find(d => d.KPMDealerNumber === selectedDealerId);
        if (selectedDealerData) {
            setSelectedDealerId(selectedDealerData.KPMDealerNumber);
        }
    }, [dealers]);

    if (loading) {
        return <div className="map-container">Loading dealers...</div>;
    }

    if (error) {
        return <div className="map-container">Error: {error}</div>;
    }

    console.log('Rendering dealers:', dealers.map(d => ({
        name: d.DealershipName,
        coords: { lat: d.lat, lng: d.lng }
    })));

    console.log('Dealers data:', dealers);

    return (
        <div className="map-container">
            <GoogleMap
                mapContainerStyle={{
                    width: '100%',
                    height: '600px'
                }}
                zoom={8}
                center={{ lat: 38.5, lng: -77.5 }}
            >
                {dealers.map(dealer => (
                    <Marker
                        key={dealer.KPMDealerNumber}
                        position={{ lat: dealer.lat!, lng: dealer.lng! }}
                    />
                ))}
            </GoogleMap>
        </div>
    );
};

export default DealerMap; 