import * as React from 'react';
import { useState, useEffect } from 'react';
import axios from 'axios';

interface Dealer {
    KPMDealerNumber: string;
    DealershipName: string;
    DBA?: string;
    MainPhone?: string;
    SalesmanCode?: string;
    SalesmanName?: string;
}

interface DealerDetails extends Dealer {
    address?: {
        StreetAddress: string;
        City: string;
        State: string;
        ZipCode: string;
        County?: string;
    };
    contact?: {
        MainPhone: string;
        FaxNumber?: string;
        MainEmail?: string;
    };
}

interface DealerPickerProps {
    selectedDealer?: string | null;
}

const API_URL = 'http://35.212.41.99:3002';

const DealerPicker: React.FC<DealerPickerProps> = ({ selectedDealer: initialDealer }) => {
    const [dealers, setDealers] = useState<Dealer[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filteredDealers, setFilteredDealers] = useState<Dealer[]>([]);
    const [selectedDealer, setSelectedDealer] = useState<Dealer | null>(null);
    const [showDropdown, setShowDropdown] = useState(false);
    const [loading, setLoading] = useState(true);

    // Load dealers on component mount
    useEffect(() => {
        const fetchDealers = async () => {
            try {
                const response = await axios.get<Dealer[]>(`${API_URL}/api/dealers`);
                console.log('Initial dealers loaded:', {
                    total: response.data.length,
                    sample: response.data.slice(0, 3)
                });
                setDealers(response.data);
                setFilteredDealers(response.data);
                setLoading(false);
            } catch (error) {
                console.error('Error loading dealers:', error);
                setLoading(false);
            }
        };
        fetchDealers();
    }, []);

    // Load initial dealer if provided
    useEffect(() => {
        if (initialDealer && dealers.length > 0) {
            const dealer = dealers.find(d => d.KPMDealerNumber === initialDealer);
            if (dealer) {
                handleDealerSelect(dealer);
            }
        }
    }, [initialDealer, dealers]);

    // Handle search input
    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setSearchTerm(value);
        setShowDropdown(true);

        console.log('Search initiated:', {
            searchValue: value,
            totalDealers: dealers.length
        });

        if (!value.trim()) {
            setFilteredDealers(dealers);
            return;
        }

        const searchLower = value.toLowerCase().trim();
        
        // Log a few dealers before filtering
        console.log('Sample dealers before filter:', 
            dealers.slice(0, 3).map(d => ({
                name: d.DealershipName,
                number: d.KPMDealerNumber,
                phone: d.MainPhone
            }))
        );

        const matches = dealers.filter(dealer => {
            const isMatch = 
                (dealer.DealershipName || '').toLowerCase().includes(searchLower) ||
                (dealer.KPMDealerNumber || '').toLowerCase().includes(searchLower) ||
                (dealer.MainPhone || '').toLowerCase().includes(searchLower);
            
            if (isMatch) {
                console.log('Found match:', {
                    searchTerm: searchLower,
                    dealerName: dealer.DealershipName,
                    dealerNumber: dealer.KPMDealerNumber
                });
            }
            
            return isMatch;
        });

        console.log('Search results:', {
            searchTerm: searchLower,
            matchesFound: matches.length
        });

        setFilteredDealers(matches);
    };

    // Handle dealer selection
    const handleDealerSelect = async (dealer: Dealer) => {
        try {
            const response = await axios.get<DealerDetails>(
                `${API_URL}/api/dealers/${dealer.KPMDealerNumber}/details`
            );
            setSelectedDealer(response.data);
            setSearchTerm('');
            setShowDropdown(false);
        } catch (error) {
            console.error('Error loading dealer details:', error);
        }
    };

    // Handle keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && filteredDealers.length > 0) {
            handleDealerSelect(filteredDealers[0]);
        }
    };

    if (loading) return <div>Loading...</div>;

    return (
        <div className="dealer-picker">
            <div className="search-container">
                <input
                    type="text"
                    placeholder="Search by dealer name, number, or phone..."
                    value={searchTerm}
                    onChange={handleSearch}
                    onKeyDown={handleKeyDown}
                    onFocus={() => setShowDropdown(true)}
                />
                
                {showDropdown && (
                    <div className="search-results">
                        {filteredDealers.length > 0 ? (
                            filteredDealers.map(dealer => (
                                <div
                                    key={dealer.KPMDealerNumber}
                                    className="search-result-item"
                                    onClick={() => handleDealerSelect(dealer)}
                                >
                                    <div className="dealer-name">{dealer.DealershipName}</div>
                                    <div className="dealer-info">
                                        <span>{dealer.KPMDealerNumber}</span>
                                        {dealer.MainPhone && <span>{dealer.MainPhone}</span>}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="no-results">No dealers found</div>
                        )}
                    </div>
                )}
            </div>

            {selectedDealer && (
                <div className="dealer-details">
                    <h2>{selectedDealer.DealershipName}</h2>
                    {/* Add other dealer details here */}
                </div>
            )}
        </div>
    );
};

export default DealerPicker; 