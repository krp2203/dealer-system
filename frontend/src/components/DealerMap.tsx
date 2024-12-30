import * as React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { GoogleMap, Marker, InfoWindow } from '@react-google-maps/api';
import axios from 'axios';
import { API_URL, GOOGLE_MAPS_API_KEY } from '../config';

interface DealerLocation {
    KPMDealerNumber: string;
    DealershipName: string;
    StreetAddress: string;
    City: string;
    State: string;
    ZipCode: string;
    lat: number;
    lng: number;
    SalesmanCode: string;
    SalesmanName: string;
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

const formatLinesCarried = (lines: string) => {
    if (!lines) return '';
    
    // Split by commas if present
    const lineArray = lines.split(',').map(line => line.trim());
    
    // Join with commas and add spaces for readability
    return lineArray.join(', ');
};

// Add interfaces for Salesman info
interface SalesmanInfo {
    name: string;
    color: string;
}

// Define salesman colors with their names
const SALESMAN_COLORS: { [key: string]: SalesmanInfo } = {
    '30': { name: 'Scott Redan', color: '#FF0000' },        // Red
    '35': { name: 'Ken Schneider', color: '#00FF00' },      // Green
    '38': { name: 'Chris Martinelli', color: '#0000FF' },   // Blue
    '45': { name: 'Michael Homeijer', color: '#FFA500' },   // Orange
    '48': { name: 'Ken Siegrist', color: '#800080' },       // Purple
    '50': { name: 'Dan Peterson', color: '#008080' },       // Teal
    '75': { name: 'Eric Fedor', color: '#FFD700' },         // Gold
    '78': { name: 'Peter Cobucci', color: '#FF1493' },      // Deep Pink
    '79': { name: 'Rich Fiengo', color: '#32CD32' },        // Lime Green
    '80': { name: 'Brian Weber', color: '#4B0082' },        // Indigo
    '81': { name: 'Andrew Garcia', color: '#FF4500' },      // Orange Red
    '82': { name: 'Matt Dracoules', color: '#00CED1' }      // Dark Turquoise
};

const DEFAULT_MARKER_COLOR = '#808080'; // Gray for unknown salesmen

// Add the Legend component
const Legend: React.FC = () => (
    <div className="map-legend">
        <h4>Salesmen</h4>
        {Object.entries(SALESMAN_COLORS).map(([code, info]) => (
            <div key={code} className="legend-item">
                <span 
                    className="legend-color" 
                    style={{ backgroundColor: info.color }}
                />
                <span className="legend-text">{info.name}</span>
            </div>
        ))}
    </div>
);

const DealerMap: React.FC<{
    dealers: DealerLocation[];
    selectedDealer?: string | null;
    onDealerSelect: (dealerNumber: string) => void;
}> = ({ dealers, selectedDealer, onDealerSelect }) => {
    // Add console logging at the start of component
    console.log('DealerMap received dealers:', dealers);

    const [hoveredDealer, setHoveredDealer] = useState<DealerLocation | null>(null);
    const [isHoveringInfoWindow, setIsHoveringInfoWindow] = useState(false);
    const [map, setMap] = useState<google.maps.Map | null>(null);
    const center = useMemo(() => ({ lat: 41.5, lng: -72.7 }), []);

    // Check if we have valid dealer data
    const validDealers = dealers.filter(dealer => 
        dealer && dealer.lat && dealer.lng && 
        !isNaN(dealer.lat) && !isNaN(dealer.lng)
    );
    console.log('Valid dealers for mapping:', validDealers);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const mapStyles = {
        height: '100%',
        width: '100%',
        minHeight: '600px'
    };

    useEffect(() => {
        // Clear all caches
        localStorage.removeItem(CACHE_KEY);
        
        const fetchDealers = async () => {
            try {
                console.log('Fetching fresh dealer data...');
                const response = await axios.get<DealerLocation[]>(`${API_URL}/api/dealers/coordinates`);
                
                if (!response.data || !Array.isArray(response.data)) {
                    throw new Error('Invalid data received');
                }

                // Filter out dealers without coordinates
                const validDealers = response.data.filter(d => d.lat && d.lng);
                console.log(`Got ${validDealers.length} dealers with valid coordinates`);

                if (validDealers.length > 0) {
                    // Update cache
                    localStorage.setItem(CACHE_KEY, JSON.stringify({
                        timestamp: Date.now(),
                        data: validDealers
                    }));
                    setDealers(validDealers);
                } else {
                    setError('No dealers found with valid coordinates');
                }
            } catch (error) {
                console.error('Error fetching dealer coordinates:', error);
                setError('Failed to fetch dealer coordinates');
            } finally {
                setLoading(false);
            }
        };

        fetchDealers();
    }, []);

    useEffect(() => {
        // Log unique salesman codes and names
        const uniqueSalesmen = new Map();
        dealers.forEach(d => {
            if (d.SalesmanCode) {
                uniqueSalesmen.set(d.SalesmanCode, d.SalesmanName);
            }
        });
        console.log('Unique Salesmen:', Object.fromEntries(uniqueSalesmen));
    }, [dealers]);

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
                {validDealers.map((dealer) => {
                    console.log('Rendering marker for dealer:', dealer);
                    const position = {
                        lat: parseFloat(dealer.lat.toString()),
                        lng: parseFloat(dealer.lng.toString())
                    };
                    const uniqueKey = `${dealer.KPMDealerNumber}-${position.lat}-${position.lng}`;
                    
                    return (
                        <Marker
                            key={uniqueKey}
                            position={position}
                            icon={{
                                path: window.google.maps.SymbolPath.CIRCLE,
                                fillColor: dealer.SalesmanCode ? 
                                    SALESMAN_COLORS[dealer.SalesmanCode]?.color || DEFAULT_MARKER_COLOR :
                                    DEFAULT_MARKER_COLOR,
                                fillOpacity: 1,
                                strokeWeight: 1,
                                strokeColor: '#FFFFFF',
                                scale: 10,
                            }}
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
                        position={{
                            lat: typeof hoveredDealer.lat === 'string' ? parseFloat(hoveredDealer.lat) : hoveredDealer.lat,
                            lng: typeof hoveredDealer.lng === 'string' ? parseFloat(hoveredDealer.lng) : hoveredDealer.lng
                        }}
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
            <Legend />
        </div>
    );
};

export default DealerMap; 