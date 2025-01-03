import * as React from 'react';
import { useState, useEffect } from 'react';
import axios from 'axios';

interface Dealer {
    KPMDealerNumber: string;
    DealershipName: string;
    DBA?: string;
    MainPhone?: string;
}

interface Salesman {
    SalesmanCode: string;
    SalesmanName: string;
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
        SecondEmail?: string;
        ThirdEmail?: string;
        FourthEmail?: string;
        FifthEmail?: string;
    };
    salesmen?: Salesman[];
    lines?: {
        LineName: string;
        AccountNumber?: string;
    }[];
}

interface DealerPickerProps {
    selectedDealer?: string | null;
}

const API_URL = 'http://35.212.41.99:3002';

// Add this interface to track unique dealers
interface UniqueDealers {
    [key: string]: Dealer;
}

// Add the line mapping constant
const LINE_MAPPINGS: { [key: string]: string } = {
    'SG': 'Scag',
    'SW': 'Snow Way',
    'VX': 'Vortex',
    'YB': 'Ybrovo',
    'OT': 'OTR Tire',
    'TY': 'Toyotomi',
    'GG': 'Grass Gobbler',
    'VK': 'Velke',
    'BB': 'Blue Bird',
    'UM': 'Umount',
    'WM': 'Wright',
    'GC': 'Grass Catcher',
    'RE': 'Rinnai',
    'TI': 'Timbrin',
    'GV': 'Giant Vac'
};

// First, add these interfaces near the top
interface LineInfo {
    LineName: string;
    AccountNumber?: string;
}

interface FormattedLine {
    name: string;
    accountNumber?: string;
}

// Add the formatLinesCarried function
const formatLinesCarried = (lines: LineInfo[]): FormattedLine[] => {
    if (!Array.isArray(lines)) return [];
    
    // Use a Map to track unique lines and their account numbers
    const uniqueLines = new Map<string, string | undefined>();
    
    lines.forEach(line => {
        // Split the LineName if it contains multiple codes
        const codes = line.LineName.split(/[,\s\(\)]+/).filter(Boolean);
        
        codes.forEach(code => {
            // Clean up the code and check if it's in our mapping
            const cleanCode = code.trim().toUpperCase();
            if (LINE_MAPPINGS[cleanCode]) {
                const lineName = LINE_MAPPINGS[cleanCode];
                // Only update if we don't already have this line or if we have a new account number
                if (!uniqueLines.has(lineName) || line.AccountNumber) {
                    uniqueLines.set(lineName, line.AccountNumber);
                }
            }
        });
    });

    // Convert Map to array and sort
    return Array.from(uniqueLines)
        .map(([name, accountNumber]) => ({
            name,
            accountNumber
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
};

const DealerPicker: React.FC<DealerPickerProps> = ({ selectedDealer: initialDealer }) => {
    const [dealers, setDealers] = useState<Dealer[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filteredDealers, setFilteredDealers] = useState<Dealer[]>([]);
    const [selectedDealer, setSelectedDealer] = useState<DealerDetails | null>(null);
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

        if (!value.trim()) {
            setFilteredDealers(dealers);
            return;
        }

        const searchLower = value.toLowerCase().trim();
        
        // Use an object to ensure unique dealers
        const uniqueDealers: UniqueDealers = {};
        
        dealers.forEach(dealer => {
            const nameMatch = (dealer.DealershipName || '').toLowerCase().includes(searchLower);
            const numberMatch = (dealer.KPMDealerNumber || '').toLowerCase().includes(searchLower);
            const phoneMatch = dealer.MainPhone?.toLowerCase().includes(searchLower);
            
            if (nameMatch || numberMatch || phoneMatch) {
                uniqueDealers[dealer.KPMDealerNumber] = dealer;
            }
        });

        const matches = Object.values(uniqueDealers);
        console.log('Search results:', {
            term: searchLower,
            matches: matches.length,
            sample: matches.slice(0, 3).map(d => d.DealershipName)
        });

        setFilteredDealers(matches);
    };

    // Handle dealer selection
    const handleDealerSelect = async (dealer: Dealer) => {
        try {
            const response = await axios.get<DealerDetails>(
                `${API_URL}/api/dealers/${dealer.KPMDealerNumber}`
            );
            
            console.log('Selected dealer details:', {
                dealerNumber: dealer.KPMDealerNumber,
                fullResponse: response.data,
                lines: response.data.lines,  // Let's specifically look at the lines data
                firstLine: response.data.lines?.[0]  // Look at the structure of the first line if it exists
            });
            
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

    // Add this near the top of the component
    useEffect(() => {
        console.log('Current filtered dealers:', {
            total: filteredDealers.length,
            sample: filteredDealers.slice(0, 3).map(d => d.DealershipName)
        });
    }, [filteredDealers]);

    // Add this to verify initial data load
    useEffect(() => {
        console.log('All dealers loaded:', {
            total: dealers.length,
            sample: dealers.slice(0, 3).map(d => d.DealershipName)
        });
    }, [dealers]);

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
                            filteredDealers.map((dealer, index) => (
                                <div
                                    key={`${dealer.KPMDealerNumber}-${index}`}
                                    className="search-result-item"
                                    onClick={() => handleDealerSelect(dealer)}
                                >
                                    <div className="dealer-name">
                                        {dealer.DealershipName}
                                        {dealer.DBA && (
                                            <span className="dealer-dba">
                                                (DBA: {dealer.DBA})
                                            </span>
                                        )}
                                    </div>
                                    <div className="dealer-info">
                                        <span className="dealer-number">
                                            #{dealer.KPMDealerNumber}
                                        </span>
                                        {dealer.MainPhone && (
                                            <span className="dealer-phone">
                                                {dealer.MainPhone}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="no-results">
                                No dealers found matching "{searchTerm}"
                            </div>
                        )}
                    </div>
                )}
            </div>

            {selectedDealer && (
                <div className="dealer-details">
                    <h2>{selectedDealer.DealershipName}</h2>
                    <div className="dealer-info-grid">
                        <div className="info-section">
                            <h3>Basic Information</h3>
                            <p><strong>Dealer Number:</strong> {selectedDealer.KPMDealerNumber}</p>
                            {selectedDealer.DBA && (
                                <p><strong>DBA:</strong> {selectedDealer.DBA}</p>
                            )}
                        </div>

                        {selectedDealer.address && (
                            <div className="info-section">
                                <h3>Address</h3>
                                <p>{selectedDealer.address.StreetAddress}</p>
                                <p>
                                    {selectedDealer.address.City}, {selectedDealer.address.State} {selectedDealer.address.ZipCode}
                                </p>
                                {selectedDealer.address.County && (
                                    <p><strong>County:</strong> {selectedDealer.address.County}</p>
                                )}
                            </div>
                        )}

                        {selectedDealer.contact && (
                            <div className="info-section">
                                <h3>Contact Information</h3>
                                {selectedDealer.contact.MainPhone && (
                                    <p><strong>Phone:</strong> {selectedDealer.contact.MainPhone}</p>
                                )}
                                {selectedDealer.contact.FaxNumber && (
                                    <p><strong>Fax:</strong> {selectedDealer.contact.FaxNumber}</p>
                                )}
                                {selectedDealer.contact.MainEmail && (
                                    <p><strong>Email:</strong> {selectedDealer.contact.MainEmail}</p>
                                )}
                            </div>
                        )}

                        {selectedDealer.salesmen && selectedDealer.salesmen.length > 0 && (
                            <div className="info-section">
                                <h3>Salesmen</h3>
                                {selectedDealer.salesmen.map((salesman, index) => (
                                    <p key={index}>
                                        {salesman.SalesmanName} ({salesman.SalesmanCode})
                                    </p>
                                ))}
                            </div>
                        )}

                        {selectedDealer.lines && selectedDealer.lines.length > 0 && (
                            <div className="info-section">
                                <h3>Lines Carried</h3>
                                <div className="lines-list">
                                    {formatLinesCarried(selectedDealer.lines).map((line, index) => (
                                        <div key={`${line.name}-${index}`} className="line-item">
                                            <span className="line-name">{line.name}</span>
                                            {line.accountNumber && (
                                                <span className="line-account">- Account: {line.accountNumber}</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default DealerPicker; 