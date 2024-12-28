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

interface CustomMarkerIcon {
    path: string;
    fillColor: string;
    fillOpacity: number;
    strokeWeight: number;
    strokeColor: string;
    scale: number;
}

const defaultMarker = {
    path: 'M 0,0 m -10,0 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0',  // SVG circle path
    fillColor: "#FF0000",
    fillOpacity: 0.9,
    strokeWeight: 2,
    strokeColor: "#FFFFFF",
    scale: 1
};

const selectedMarker = {
    path: 'M 0,0 m -12,0 a 12,12 0 1,0 24,0 a 12,12 0 1,0 -24,0',  // Larger SVG circle
    fillColor: "#4CAF50",
    fillOpacity: 1,
    strokeWeight: 3,
    strokeColor: "#FFFFFF",
    scale: 1
};

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
    const [selectedDealer, setSelectedDealer] = useState<DealerLocation | null>(null);
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
                    if (data && data.length > 0) {
                        setDealers(data);
                        setLoading(false);
                        return;
                    }
                }

                const response = await axios.get<DealerLocation[]>('http://35.212.41.99:3002/api/dealers/coordinates');
                
                if (!response.data || !Array.isArray(response.data)) {
                    throw new Error('Invalid data received');
                }

                // Process dealers in batches
                const dealersWithCoords = [];
                const batchSize = 10;

                for (let i = 0; i < response.data.length; i += batchSize) {
                    const batch = response.data.slice(i, i + batchSize);
                    const batchResults = await Promise.all(
                        batch.map(async (dealer) => {
                            const address = `${dealer.StreetAddress}, ${dealer.City}, ${dealer.State} ${dealer.ZipCode}`;
                            const coords = await getCoordinates(address);
                            return coords ? { ...dealer, ...coords } : dealer;
                        })
                    );
                    dealersWithCoords.push(...batchResults);
                }

                const validDealers = dealersWithCoords.filter(d => d.lat && d.lng);
                
                if (validDealers.length > 0) {
                    localStorage.setItem(CACHE_KEY, JSON.stringify({ data: validDealers }));
                    setDealers(validDealers);
                } else {
                    setError('No dealers found with valid coordinates');
                }
            } catch (error) {
                setError('Failed to fetch dealers');
                console.error(error);
            } finally {
                setLoading(false);
            }
        };

        fetchDealers();
    }, []);

    if (loading) {
        return <div className="map-container">Loading dealers...</div>;
    }

    if (error) {
        return <div className="map-container">Error: {error}</div>;
    }

    return (
        <div className="map-container">
            <GoogleMap
                mapContainerStyle={mapStyles}
                zoom={mapZoom}
                center={mapCenter}
                options={{
                    zoomControl: true,
                    mapTypeControl: true,
                    scaleControl: true,
                    streetViewControl: true,
                    rotateControl: true,
                    fullscreenControl: true
                }}
            >
                {dealers && dealers.map(dealer => {
                    if (!dealer?.lat || !dealer?.lng) return null;
                    return (
                        <Marker
                            key={dealer.KPMDealerNumber}
                            position={{ lat: dealer.lat, lng: dealer.lng }}
                            icon={dealer.KPMDealerNumber === selectedDealer?.KPMDealerNumber ? selectedMarker : defaultMarker}
                            onMouseOver={() => setHoveredDealer(dealer)}
                            onMouseOut={() => {
                                if (!isHoveringInfoWindow) {
                                    setHoveredDealer(null);
                                }
                            }}
                            onClick={() => onDealerSelect(dealer.KPMDealerNumber)}
                        />
                    );
                })}

                {hoveredDealer && hoveredDealer.lat && hoveredDealer.lng && (
                    <InfoWindow
                        position={{ lat: hoveredDealer.lat, lng: hoveredDealer.lng }}
                        onCloseClick={() => setHoveredDealer(null)}
                        options={{ pixelOffset: new window.google.maps.Size(0, -30) }}
                    >
                        <div 
                            onMouseEnter={() => setIsHoveringInfoWindow(true)}
                            onMouseLeave={() => {
                                setIsHoveringInfoWindow(false);
                                setHoveredDealer(null);
                            }}
                            style={{ padding: '8px', minWidth: '200px' }}
                        >
                            <h3>{hoveredDealer.DealershipName}</h3>
                            <p>{hoveredDealer.StreetAddress}</p>
                            <p>{hoveredDealer.City}, {hoveredDealer.State} {hoveredDealer.ZipCode}</p>
                        </div>
                    </InfoWindow>
                )}
            </GoogleMap>
        </div>
    );
};

export default DealerMap; 