import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';

interface Dealer {
    KPMDealerNumber: string;
    DealershipName: string;
    DBA?: string;
}

interface DealerDetails {
    DealershipName: string;
    DBA?: string;
    KPMDealerNumber: string;
    address: {
        StreetAddress: string;
        BoxNumber?: string;
        City: string;
        State: string;
        ZipCode: string;
        County: string;
    };
    contact: {
        MainPhone: string;
        FaxNumber: string;
        MainEmail: string;
    };
    lines: Array<{
        code: string;
        accountNumber?: string;
    }>;
    salesman: {
        SalesmanName: string;
        SalesmanCode: string;
    };
    salesmen: Array<{
        SalesmanName: string;
        SalesmanCode: string;
    }>;
}

const API_URL = 'http://35.212.41.99:3002';

const LINE_MAPPINGS: { [key: string]: string } = {
    'SG': 'Scag',
    'SW': 'Snow Way',
    'VX': 'Vortex',
    'YB': 'Ybrovo',
    'OT': 'OTR Tire',
    'TY': 'Toyotomi',
    'GG': 'Grass Gobbler GR',
    'VK': 'Velke',
    'BB': 'Blue Bird',
    'UM': 'Umount',
    'WM': 'Wright',
    'GC': 'Grass Catcher',
    'RE': 'Rinnai',
    'TI': 'Timbrin',
    'GV': 'Giant Vac'
};

interface FormattedLine {
    name: string;
    accountNumber?: string;
}

interface LineInfo {
    code: string;
    accountNumber?: string;
}

const formatLinesCarried = (lines: LineInfo[]): FormattedLine[] => {
    if (!Array.isArray(lines)) return [];
    
    // Use a Map to track unique lines and their account numbers
    const uniqueLines = new Map<string, string | undefined>();
    
    // Process each line code
    lines.forEach(line => {
        const codes = line.code.split(/[,\s]+/).filter(Boolean);
        
        codes
            .map(code => code.trim())
            .filter(code => LINE_MAPPINGS[code])
            .forEach(code => {
                const lineName = LINE_MAPPINGS[code];
                // Only update if we don't already have this line or if we have a new account number
                if (!uniqueLines.has(lineName) || line.accountNumber) {
                    uniqueLines.set(lineName, line.accountNumber);
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

// Add type for search results
interface SearchableDealer extends Dealer {
    details?: DealerDetails;
}

// Add debounce utility at the top of the file
const debounce = <T extends (...args: any[]) => void>(func: T, wait: number) => {
    let timeout: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
};

const DealerPicker: React.FC<{ selectedDealer?: string | null }> = ({ selectedDealer: initialDealer }) => {
    const [dealers, setDealers] = useState<Dealer[]>([]);
    const [selectedDealer, setSelectedDealer] = useState<string | null>(null);
    const [dealerDetails, setDealerDetails] = useState<DealerDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editedDetails, setEditedDetails] = useState<DealerDetails | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [selectedDealerName, setSelectedDealerName] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState('');
    const [isDropdownVisible, setIsDropdownVisible] = useState(false);
    const detailsRef = useRef<HTMLDivElement>(null);
    const [allDealerDetails, setAllDealerDetails] = useState<{ [key: string]: DealerDetails }>({});
    const [isSearching, setIsSearching] = useState(false);
    const [isInitialLoad, setIsInitialLoad] = useState(true);
    const [isSearchLoading, setIsSearchLoading] = useState(false);
    const [filteredDealers, setFilteredDealers] = useState<Dealer[]>([]);

    useEffect(() => {
        const fetchDealers = async () => {
            try {
                console.log('Fetching dealer list...');
                const response = await axios.get<Dealer[]>(`${API_URL}/api/dealers`);
                setDealers(response.data);
                setFilteredDealers(response.data); // Initialize filtered list
                setLoading(false);
            } catch (err) {
                setError('Failed to fetch dealers');
                setLoading(false);
            }
        };

        fetchDealers();
    }, []);

    const fetchDealerDetails = async (dealerNumber: string) => {
        try {
            const response = await axios.get<DealerDetails>(`${API_URL}/api/dealers/${dealerNumber}`);
            return response.data;
        } catch (error) {
            console.error('Error fetching dealer details:', error);
            return null;
        }
    };

    const loadDealerDetails = async (dealerNumber: string) => {
        if (!dealerNumber) {
            setSelectedDealer(null);
            setDealerDetails(null);
            setSelectedDealerName('');
            return;
        }

        try {
            console.log('Loading details for dealer:', dealerNumber);
            const response = await axios.get<DealerDetails>(`${API_URL}/api/dealers/${dealerNumber}`);
            console.log('Received dealer details:', response.data);
            
            setDealerDetails(response.data);
            setSelectedDealer(dealerNumber);
            
            const dealer = dealers.find(d => d.KPMDealerNumber === dealerNumber);
            if (dealer) {
                setSelectedDealerName(dealer.DealershipName);
                console.log('Salesman info:', {
                    code: response.data.salesman.SalesmanCode,
                    name: response.data.salesman.SalesmanName
                });
            }

            setTimeout(() => {
                detailsRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 100);

        } catch (err) {
            console.error('Error loading dealer details:', err);
            setError('Failed to fetch dealer details');
        }
    };

    const handleDealerChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        loadDealerDetails(event.target.value);
    };

    const handleEdit = () => {
        setIsEditing(true);
        setEditedDetails(dealerDetails);
    };

    const handleSave = async () => {
        if (!editedDetails || !selectedDealer) return;
        setIsSaving(true);
        try {
            console.log('Sending updates:', editedDetails);
            
            const response = await axios.put<DealerDetails>(
                `${API_URL}/api/dealers/${selectedDealer}`, 
                editedDetails
            );

            if (response.data) {
                setDealerDetails(response.data);
                setEditedDetails(null);
                setIsEditing(false);
                
                // Show success message
                alert('Changes saved successfully!');
            }
        } catch (err) {
            console.error('Save error:', err);
            alert('Failed to save changes. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        setIsEditing(false);
        setEditedDetails(dealerDetails);
    };

    const handleInputChange = (section: '' | 'address' | 'contact' | 'salesman', field: string, value: string) => {
        if (!editedDetails) return;

        if (section === '') {
            // Handle root-level properties directly
            setEditedDetails({
                ...editedDetails,
                [field]: value
            });
        } else {
            // Handle nested properties with type checking
            const currentSection = editedDetails[section] as Record<string, string>;
            
            setEditedDetails({
                ...editedDetails,
                [section]: {
                    ...currentSection,
                    [field]: value
                }
            });
        }
    };

    // Add a function to load details for search
    const loadDetailsForSearch = async (searchTerm: string) => {
        setIsSearchLoading(true);
        try {
            // First search basic info
            let results = dealers.filter(dealer => 
                (dealer.DealershipName || '').toLowerCase().includes(searchTerm) ||
                (dealer.KPMDealerNumber || '').toLowerCase().includes(searchTerm) ||
                (dealer.DBA || '').toLowerCase().includes(searchTerm)
            );

            // If no results found in basic info, search detailed info
            if (results.length === 0 && searchTerm.length >= 3) {
                const response = await axios.get(`${API_URL}/api/dealers/search?term=${encodeURIComponent(searchTerm)}`);
                results = response.data;
            }

            setFilteredDealers(results);
        } catch (error) {
            console.error('Search error:', error);
            setFilteredDealers([]);
        } finally {
            setIsSearchLoading(false);
        }
    };

    // Update the performSearch function
    const performSearch = (value: string) => {
        setSearchTerm(value);
        const searchLower = value.toLowerCase().trim();
        
        if (!searchLower) {
            setFilteredDealers(dealers);
            return;
        }

        loadDetailsForSearch(searchLower);
    };

    // Add an effect to initialize filtered dealers
    useEffect(() => {
        if (dealers.length > 0) {
            setFilteredDealers(dealers);
        }
    }, [dealers]);

    // Create a memoized debounced search
    const debouncedSearch = React.useCallback(
        debounce((value: string) => performSearch(value), 300),
        []  // Empty dependency array since we don't want to recreate this
    );

    // Update the input handler
    const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setSearchTerm(value);
        setIsDropdownVisible(true);
        debouncedSearch(value);
    };

    useEffect(() => {
        if (initialDealer) {
            loadDealerDetails(initialDealer);
        }
    }, [initialDealer, dealers]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const searchContainer = document.querySelector('.search-container');
            if (searchContainer && !searchContainer.contains(event.target as Node)) {
                setIsDropdownVisible(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    if (loading) return <div>Loading...</div>;
    if (error) return <div>Error: {error}</div>;

    return (
        <div className="details-section">
            <div className="dealer-picker">
                <div className="search-container">
                    <input
                        type="text"
                        placeholder="Search by name, number, address, phone, or any other details..."
                        value={searchTerm}
                        onChange={onInputChange}
                        onFocus={() => setIsDropdownVisible(true)}
                    />
                    {isDropdownVisible && (
                        <div className="search-results">
                            {isSearchLoading ? (
                                <div className="searching">Searching...</div>
                            ) : filteredDealers.length > 0 ? (
                                filteredDealers.map((dealer: Dealer) => (
                                    <div
                                        key={dealer.KPMDealerNumber}
                                        className="search-result-item"
                                        onClick={() => {
                                            loadDealerDetails(dealer.KPMDealerNumber);
                                            setSearchTerm('');
                                            setIsDropdownVisible(false);
                                        }}
                                    >
                                        <div className="dealer-name">
                                            {dealer.DealershipName}
                                            {dealer.DBA && <span className="dealer-dba"> (DBA: {dealer.DBA})</span>}
                                        </div>
                                        <div className="dealer-number">{dealer.KPMDealerNumber}</div>
                                    </div>
                                ))
                            ) : (
                                <div className="no-results">No dealers found</div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {selectedDealerName && (
                <div ref={detailsRef}>
                    <h2 className="dealer-title">{selectedDealerName}</h2>
                    {dealerDetails && (
                        <div className="dealer-details">
                            <div className="edit-buttons">
                                {isEditing ? (
                                    <>
                                        <button 
                                            className="save-button" 
                                            onClick={handleSave}
                                            disabled={isSaving}
                                        >
                                            {isSaving ? 'Saving...' : 'Save Changes'}
                                        </button>
                                        <button 
                                            className="cancel-button" 
                                            onClick={handleCancel}
                                        >
                                            Cancel
                                        </button>
                                    </>
                                ) : (
                                    <button 
                                        className="edit-button" 
                                        onClick={handleEdit}
                                    >
                                        Edit Details
                                    </button>
                                )}
                            </div>

                            <section>
                                <h3>Basic Information</h3>
                                {isEditing ? (
                                    <>
                                        <input
                                            type="text"
                                            value={editedDetails?.DBA || ''}
                                            onChange={(e) => handleInputChange('', 'DBA', e.target.value)}
                                            placeholder="DBA"
                                        />
                                    </>
                                ) : (
                                    <>
                                        <p><strong>Dealer Number:</strong> {dealerDetails.KPMDealerNumber}</p>
                                        {dealerDetails.DBA && (
                                            <p><strong>DBA:</strong> {dealerDetails.DBA}</p>
                                        )}
                                    </>
                                )}
                            </section>

                            <section>
                                <h3>Contact Information</h3>
                                {isEditing ? (
                                    <>
                                        <input
                                            type="text"
                                            value={editedDetails?.contact.MainPhone || ''}
                                            onChange={(e) => handleInputChange('contact', 'MainPhone', e.target.value)}
                                            placeholder="Phone"
                                        />
                                        <input
                                            type="text"
                                            value={editedDetails?.contact.FaxNumber || ''}
                                            onChange={(e) => handleInputChange('contact', 'FaxNumber', e.target.value)}
                                            placeholder="Fax"
                                        />
                                        <input
                                            type="email"
                                            value={editedDetails?.contact.MainEmail || ''}
                                            onChange={(e) => handleInputChange('contact', 'MainEmail', e.target.value)}
                                            placeholder="Email"
                                        />
                                    </>
                                ) : (
                                    <>
                                        <p><strong>Phone:</strong> {dealerDetails.contact.MainPhone}</p>
                                        {dealerDetails.contact.FaxNumber && (
                                            <p><strong>Fax:</strong> {dealerDetails.contact.FaxNumber}</p>
                                        )}
                                        <p><strong>Email:</strong> {dealerDetails.contact.MainEmail}</p>
                                    </>
                                )}
                            </section>
                            
                            <section>
                                <h3>Address</h3>
                                {isEditing ? (
                                    <>
                                        <input
                                            type="text"
                                            value={editedDetails?.address.StreetAddress || ''}
                                            onChange={(e) => handleInputChange('address', 'StreetAddress', e.target.value)}
                                            placeholder="Street Address"
                                        />
                                        <input
                                            type="text"
                                            value={editedDetails?.address.BoxNumber || ''}
                                            onChange={(e) => handleInputChange('address', 'BoxNumber', e.target.value)}
                                            placeholder="Box Number"
                                        />
                                        <input
                                            type="text"
                                            value={editedDetails?.address.City || ''}
                                            onChange={(e) => handleInputChange('address', 'City', e.target.value)}
                                            placeholder="City"
                                        />
                                        <input
                                            type="text"
                                            value={editedDetails?.address.State || ''}
                                            onChange={(e) => handleInputChange('address', 'State', e.target.value)}
                                            placeholder="State"
                                        />
                                        <input
                                            type="text"
                                            value={editedDetails?.address.ZipCode || ''}
                                            onChange={(e) => handleInputChange('address', 'ZipCode', e.target.value)}
                                            placeholder="Zip Code"
                                        />
                                        <input
                                            type="text"
                                            value={editedDetails?.address.County || ''}
                                            onChange={(e) => handleInputChange('address', 'County', e.target.value)}
                                            placeholder="County"
                                        />
                                    </>
                                ) : (
                                    <>
                                        <p>{dealerDetails.address.StreetAddress}</p>
                                        {dealerDetails.address.BoxNumber && (
                                            <p>Box: {dealerDetails.address.BoxNumber}</p>
                                        )}
                                        <p>{dealerDetails.address.City}, {dealerDetails.address.State} {dealerDetails.address.ZipCode}</p>
                                        <p><strong>County:</strong> {dealerDetails.address.County}</p>
                                        <button 
                                            className="directions-button"
                                            onClick={() => {
                                                const address = encodeURIComponent(
                                                    `${dealerDetails.address.StreetAddress}, ${dealerDetails.address.City}, ${dealerDetails.address.State} ${dealerDetails.address.ZipCode}`
                                                );
                                                window.open(`https://www.google.com/maps/dir/?api=1&destination=${address}`, '_blank');
                                            }}
                                        >
                                            <span>📍 Get Directions</span>
                                        </button>
                                    </>
                                )}
                            </section>

                            <section>
                                <h3>Salesman Information</h3>
                                {dealerDetails.salesmen && dealerDetails.salesmen.length > 0 ? (
                                    <div className="salesmen-list">
                                        {dealerDetails.salesmen.map((salesman, index) => (
                                            <div key={index} className="salesman-item">
                                                <p><strong>Name:</strong> {salesman.SalesmanName}</p>
                                                <p><strong>Code:</strong> {salesman.SalesmanCode}</p>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p>No salesman assigned</p>
                                )}
                            </section>

                            {dealerDetails.lines && (
                                <section>
                                    <h3>Lines Carried</h3>
                                    <div className="lines-list">
                                        {formatLinesCarried(dealerDetails.lines).map(line => (
                                            <div key={line.name} className="line-item">
                                                <span className="line-name">{line.name}</span>
                                                {line.accountNumber && (
                                                    <span className="line-account">- Account: {line.accountNumber}</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default DealerPicker; 