import React, { useEffect, useState } from 'react';
import { GoogleMap, LoadScript, Marker, InfoWindow } from '@react-google-maps/api';
import { API_URL, GOOGLE_MAPS_API_KEY } from '../config';

interface Dealer {
    KPMDealerNumber: string;
    DealershipName: string;
    Latitude: number;
    Longitude: number;
    StreetAddress?: string;
    City?: string;
    State?: string;
    ZipCode?: string;
}

interface DealerMapProps {
    onDealerSelect?: (dealerNumber: string) => void;
}

const DealerMap: React.FC<DealerMapProps> = ({ onDealerSelect }) => {
    const [dealers, setDealers] = useState<Dealer[]>([]);
    const [selectedDealer, setSelectedDealer] = useState<Dealer | null>(null);
    const [error, setError] = useState<string>('');
    const [mapCenter, setMapCenter] = useState({ lat: 39.8283, lng: -98.5795 }); // US center
    const [zoom, setZoom] = useState(4);

    useEffect(() => {
        const fetchDealers = async () => {
            try {
                const response = await fetch(`${API_URL}/dealers`);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                console.log('Fetched dealers:', data);
                
                // Filter out dealers without coordinates
                const dealersWithCoordinates = data.filter(
                    (dealer: Dealer) => dealer.Latitude && dealer.Longitude
                );
                
                if (dealersWithCoordinates.length === 0) {
                    throw new Error('No dealers found with valid coordinates');
                }
                
                setDealers(dealersWithCoordinates);
                setError('');
            } catch (err) {
                console.error('Error fetching dealers:', err);
                setError('Failed to fetch dealer coordinates');
            }
        };

        fetchDealers();
    }, []);

    const handleMarkerClick = (dealer: Dealer) => {
        setSelectedDealer(dealer);
        if (onDealerSelect) {
            onDealerSelect(dealer.KPMDealerNumber);
        }
    };

    if (error) {
        return <div className="error-message">{error}</div>;
    }

    return (
        <LoadScript googleMapsApiKey={GOOGLE_MAPS_API_KEY}>
            <GoogleMap
                mapContainerStyle={{
                    width: '100%',
                    height: '600px'
                }}
                center={mapCenter}
                zoom={zoom}
            >
                {dealers.map((dealer) => (
                    <Marker
                        key={dealer.KPMDealerNumber}
                        position={{
                            lat: Number(dealer.Latitude),
                            lng: Number(dealer.Longitude)
                        }}
                        onClick={() => handleMarkerClick(dealer)}
                    />
                ))}

                {selectedDealer && (
                    <InfoWindow
                        position={{
                            lat: selectedDealer.Latitude,
                            lng: selectedDealer.Longitude
                        }}
                        onCloseClick={() => setSelectedDealer(null)}
                    >
                        <div>
                            <h3>{selectedDealer.DealershipName}</h3>
                            {selectedDealer.StreetAddress && (
                                <p>
                                    {selectedDealer.StreetAddress}<br />
                                    {selectedDealer.City}, {selectedDealer.State} {selectedDealer.ZipCode}
                                </p>
                            )}
                        </div>
                    </InfoWindow>
                )}
            </GoogleMap>
        </LoadScript>
    );
};

export default DealerMap; 