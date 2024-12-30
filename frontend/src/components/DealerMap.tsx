import * as React from 'react';
import { useState, useEffect } from 'react';
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

interface SalesmanInfo {
    name: string;
    color: string;
}

// Predefined colors for markers
const MARKER_COLORS = [
    '#FF0000', // Red
    '#00FF00', // Green
    '#0000FF', // Blue
    '#FFA500', // Orange
    '#800080', // Purple
    '#008080', // Teal
    '#FF69B4', // Hot Pink
    '#4B0082', // Indigo
    '#FFD700', // Gold
    '#00CED1', // Dark Turquoise
    '#FF6347', // Tomato
    '#32CD32', // Lime Green
    '#BA55D3', // Medium Orchid
    '#CD853F', // Peru
    '#48D1CC'  // Medium Turquoise
];

const DealerMap: React.FC<{
    selectedDealer: string | null;
    onDealerSelect: (dealerNumber: string) => void;
}> = ({ selectedDealer, onDealerSelect }) => {
    const [dealers, setDealers] = useState<DealerLocation[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [hoveredDealer, setHoveredDealer] = useState<DealerLocation | null>(null);
    const [isHoveringInfoWindow, setIsHoveringInfoWindow] = useState(false);
    const [salesmanColors, setSalesmanColors] = useState<{ [key: string]: SalesmanInfo }>({});
    const [mapCenter, setMapCenter] = useState({ lat: 37.5, lng: -79.0 });
    const [mapZoom, setMapZoom] = useState(6);

    const mapStyles = {
        width: '100%',
        height: '100%'
    };

    useEffect(() => {
        const fetchDealers = async () => {
            try {
                const response = await axios.get(`${API_URL}/api/dealers/coordinates`);
                setDealers(response.data);
                setLoading(false);
            } catch (err) {
                setError('Failed to fetch dealers');
                setLoading(false);
            }
        };

        fetchDealers();
    }, []);

    useEffect(() => {
        const fetchSalesmen = async () => {
            try {
                const response = await axios.get<Array<{ SalesmanCode: string; SalesmanName: string }>>(`${API_URL}/api/salesmen`);
                const salesmen = response.data;
                
                // Create color mapping for each salesman
                const colorMap = salesmen.reduce((acc: { [key: string]: SalesmanInfo }, salesman, index) => {
                    acc[salesman.SalesmanCode] = {
                        name: salesman.SalesmanName,
                        color: MARKER_COLORS[index % MARKER_COLORS.length]
                    };
                    return acc;
                }, {});
                
                setSalesmanColors(colorMap);
            } catch (error) {
                console.error('Error fetching salesmen:', error);
            }
        };
        
        fetchSalesmen();
    }, []);

    if (loading) {
        return <div className="map-container">Loading...</div>;
    }

    if (error) {
        return <div className="map-container">Error: {error}</div>;
    }

    const Legend = () => (
        <div className="map-legend">
            <h4>Salesmen</h4>
            {Object.entries(salesmanColors).map(([code, info]) => (
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

    return (
        <div className="map-container">
            <GoogleMap
                mapContainerStyle={mapStyles}
                zoom={mapZoom}
                center={mapCenter}
                options={{
                    zoomControl: true,
                    mapTypeControl: true,
                    streetViewControl: false,
                    fullscreenControl: true
                }}
            >
                {dealers.map((dealer) => {
                    const position = {
                        lat: dealer.lat,
                        lng: dealer.lng
                    };
                    const uniqueKey = `${dealer.KPMDealerNumber}-${dealer.lat}-${dealer.lng}`;

                    return (
                        <Marker
                            key={uniqueKey}
                            position={position}
                            icon={{
                                path: window.google.maps.SymbolPath.CIRCLE,
                                fillColor: dealer.SalesmanCode ? 
                                    salesmanColors[dealer.SalesmanCode]?.color || '#808080' :
                                    '#808080',
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
                {hoveredDealer && (
                    <InfoWindow
                        position={{ lat: hoveredDealer.lat, lng: hoveredDealer.lng }}
                        onCloseClick={() => setHoveredDealer(null)}
                        onMouseOver={() => setIsHoveringInfoWindow(true)}
                        onMouseOut={() => setIsHoveringInfoWindow(false)}
                    >
                        <div>
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