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

const DealerMap: React.FC<{
    onDealerSelect: (dealerNumber: string) => void;
}> = ({ onDealerSelect }) => {
    const [dealers, setDealers] = useState<DealerLocation[]>([]);
    const [selectedDealer, setSelectedDealer] = useState<DealerLocation | null>(null);
    const [mapCenter] = useState({ lat: 37.5, lng: -79.0 });
    const [mapZoom] = useState(6);
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
        // Clear all caches
        localStorage.removeItem(CACHE_KEY);
        
        const fetchDealers = async () => {
            try {
                console.log('Fetching dealer data from:', `${API_URL}/api/dealers/coordinates`);
                const response = await axios.get<DealerLocation[]>(`${API_URL}/api/dealers/coordinates`);
                
                if (!response.data || !Array.isArray(response.data)) {
                    console.error('Invalid data received:', response.data);
                    throw new Error('Invalid data format received from server');
                }

                // Filter out dealers without coordinates
                const validDealers = response.data.filter(d => {
                    const hasCoords = d.lat && d.lng;
                    if (!hasCoords) {
                        console.log('Dealer missing coordinates:', d.KPMDealerNumber);
                    }
                    return hasCoords;
                });

                console.log(`Got ${validDealers.length} dealers with valid coordinates`);
                setDealers(validDealers);
            } catch (error) {
                console.error('Error fetching dealer coordinates:', error);
                if (axios.isAxiosError(error)) {
                    setError(`Failed to fetch dealer data: ${error.response?.data?.error || error.message}`);
                } else {
                    setError('Failed to fetch dealer data: Unknown error');
                }
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

    const renderInfoWindow = (dealer: any) => (
        <div className="dealer-info" key={dealer.KPMDealerNumber}>
            <h3>{dealer.DealershipName}</h3>
            {dealer.DBA && <p key={`${dealer.KPMDealerNumber}-dba`}><strong>DBA:</strong> {dealer.DBA}</p>}
            
            {/* Address Information */}
            <div className="address-info" key={`${dealer.KPMDealerNumber}-address`}>
                {dealer.StreetAddress && <p>{dealer.StreetAddress}</p>}
                {dealer.City && dealer.State && dealer.ZipCode && (
                    <p>{dealer.City}, {dealer.State} {dealer.ZipCode}</p>
                )}
            </div>

            {/* Contact Information */}
            <div className="contact-info" key={`${dealer.KPMDealerNumber}-contact`}>
                {dealer.MainPhone && <p><strong>Phone:</strong> {dealer.MainPhone}</p>}
                {dealer.FaxNumber && <p><strong>Fax:</strong> {dealer.FaxNumber}</p>}
                {dealer.MainEmail && <p><strong>Email:</strong> {dealer.MainEmail}</p>}
            </div>

            {/* Lines Carried */}
            {dealer.LinesCarried && (
                <div className="lines-info" key={`${dealer.KPMDealerNumber}-lines`}>
                    <p><strong>Lines Carried:</strong> {dealer.LinesCarried}</p>
                </div>
            )}

            {/* Salesman Information */}
            {dealer.SalesmanName && (
                <div className="salesman-info" key={`${dealer.KPMDealerNumber}-salesman`}>
                    <p><strong>Salesman:</strong> {dealer.SalesmanName}</p>
                    {dealer.SalesmanCode && <p><strong>Code:</strong> {dealer.SalesmanCode}</p>}
                </div>
            )}
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
                    scaleControl: true,
                    streetViewControl: true,
                    rotateControl: true,
                    fullscreenControl: true
                }}
            >
                {dealers.map((dealer) => (
                    <Marker
                        key={`${dealer.KPMDealerNumber}-marker`}
                        position={{ lat: parseFloat(dealer.lat), lng: parseFloat(dealer.lng) }}
                        onClick={() => onDealerSelect(dealer.KPMDealerNumber)}
                        onMouseOver={() => setHoveredDealer(dealer)}
                        onMouseOut={() => !isHoveringInfoWindow && setHoveredDealer(null)}
                    />
                ))}

                {hoveredDealer && hoveredDealer.lat && hoveredDealer.lng && (
                    <InfoWindow
                        position={{
                            lat: typeof hoveredDealer.lat === 'string' ? parseFloat(hoveredDealer.lat) : hoveredDealer.lat,
                            lng: typeof hoveredDealer.lng === 'string' ? parseFloat(hoveredDealer.lng) : hoveredDealer.lng
                        }}
                        onCloseClick={() => setHoveredDealer(null)}
                        options={{ pixelOffset: new window.google.maps.Size(0, -30) }}
                    >
                        {renderInfoWindow(hoveredDealer)}
                    </InfoWindow>
                )}
            </GoogleMap>
        </div>
    );
};

export default DealerMap; 