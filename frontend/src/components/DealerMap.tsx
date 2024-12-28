import * as React from 'react';
import { useState, useEffect } from 'react';
import { GoogleMap, Marker, InfoWindow } from '@react-google-maps/api';
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
    error_message?: string;
}

const GOOGLE_MAPS_API_KEY = 'AIzaSyBjFQbtxL4dTowDjMxB5UBtm4Z9Jf6UB5c';

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
    const [mapCenter] = useState({ lat: 38.5, lng: -77.5 }); // Centered between VA and MD
    const [mapZoom] = useState(8); // Zoom out a bit more
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [hoveredDealer, setHoveredDealer] = useState<DealerLocation | null>(null);

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

                // Process dealers in smaller batches to avoid rate limits
                const batchSize = 5;
                const allDealers = [...response.data];
                const dealersWithCoords = [];

                for (let i = 0; i < allDealers.length; i += batchSize) {
                    const batch = allDealers.slice(i, i + batchSize);
                    console.log(`Processing batch ${i/batchSize + 1}...`);

                    const batchResults = await Promise.all(
                        batch.map(async (dealer) => {
                            const address = `${dealer.StreetAddress}, ${dealer.City}, ${dealer.State} ${dealer.ZipCode}`;
                            console.log('Geocoding:', address);
                            
                            const coords = await getCoordinates(address);
                            if (coords) {
                                console.log(`Got coordinates for ${dealer.DealershipName}:`, coords);
                                return { ...dealer, ...coords };
                            }
                            return dealer;
                        })
                    );

                    dealersWithCoords.push(...batchResults);
                    // Add a delay between batches to respect rate limits
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                const validDealers = dealersWithCoords.filter((d): d is DealerLocation & { lat: number; lng: number } => {
                    const isValid = typeof d.lat === 'number' && typeof d.lng === 'number';
                    if (!isValid) {
                        console.warn('Invalid dealer coordinates:', {
                            name: d.DealershipName,
                            address: `${d.StreetAddress}, ${d.City}, ${d.State} ${d.ZipCode}`,
                            coords: { lat: d.lat, lng: d.lng }
                        });
                    }
                    return isValid;
                });

                console.log('Valid dealers after filtering:', validDealers.map(d => ({
                    name: d.DealershipName,
                    address: `${d.StreetAddress}, ${d.City}, ${d.State} ${d.ZipCode}`,
                    coords: { lat: d.lat, lng: d.lng }
                })));

                if (validDealers.length === 0) {
                    setError('No dealers found with valid coordinates');
                } else {
                    console.log(`Setting ${validDealers.length} dealers with coordinates`);
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

    console.log('Rendering map with dealers:', dealers.map(d => ({
        name: d.DealershipName,
        coords: { lat: d.lat, lng: d.lng }
    })));

    console.log('Map center:', mapCenter);
    console.log('Map zoom:', mapZoom);
    console.log('Valid dealers:', dealers.filter(d => d.lat && d.lng).length);
    console.log('All dealers:', dealers.map(d => ({
        name: d.DealershipName,
        address: `${d.StreetAddress}, ${d.City}, ${d.State} ${d.ZipCode}`,
        coords: { lat: d.lat, lng: d.lng }
    })));

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
                onLoad={(map) => {
                    console.log('Map loaded');
                    const bounds = new window.google.maps.LatLngBounds();
                    dealers.forEach(dealer => {
                        if (dealer.lat && dealer.lng) {
                            bounds.extend({ lat: dealer.lat, lng: dealer.lng });
                        }
                    });
                    map.fitBounds(bounds);
                }}
            >
                {dealers.length > 0 && dealers.map(dealer => {
                    if (!dealer.lat || !dealer.lng) {
                        return null;
                    }
                    return (
                        <Marker
                            key={dealer.KPMDealerNumber}
                            position={{ lat: dealer.lat, lng: dealer.lng }}
                            onClick={() => {
                                setSelectedDealer(dealer);
                                onDealerSelect(dealer.KPMDealerNumber);
                            }}
                            onMouseOver={() => setHoveredDealer(dealer)}
                            onMouseOut={() => setHoveredDealer(null)}
                        />
                    );
                })}

                {hoveredDealer && !selectedDealer && (
                    <InfoWindow
                        position={{ lat: hoveredDealer.lat!, lng: hoveredDealer.lng! }}
                        onCloseClick={() => setHoveredDealer(null)}
                    >
                        <div>
                            <h3>{hoveredDealer.DealershipName}</h3>
                            <p>{hoveredDealer.StreetAddress}</p>
                            <p>{hoveredDealer.City}, {hoveredDealer.State} {hoveredDealer.ZipCode}</p>
                            <button onClick={() => {
                                setSelectedDealer(hoveredDealer);
                                onDealerSelect(hoveredDealer.KPMDealerNumber);
                            }}>
                                View Details
                            </button>
                        </div>
                    </InfoWindow>
                )}

                {selectedDealer && (
                    <InfoWindow
                        position={{ lat: selectedDealer.lat!, lng: selectedDealer.lng! }}
                        onCloseClick={() => setSelectedDealer(null)}
                    >
                        <div>
                            <h3>{selectedDealer.DealershipName}</h3>
                            <p>{selectedDealer.StreetAddress}</p>
                            <p>{selectedDealer.City}, {selectedDealer.State} {selectedDealer.ZipCode}</p>
                        </div>
                    </InfoWindow>
                )}
            </GoogleMap>
        </div>
    );
};

export default DealerMap; 