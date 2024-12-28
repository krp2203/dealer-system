import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Dealer } from '../types/dealer';

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
        LineName: string;
        AccountNumber: string;
    }>;
    salesman: {
        SalesmanName: string;
        SalesmanCode: string;
    };
}

// Add interface for our filters
interface Filters {
    salesman: string;
    productLine: string;
    state: string;
}

const API_URL = 'http://35.212.41.99:3002';

interface DealerPickerProps {
    selectedDealer?: string | null;
    dealers: Dealer[];
    onDealersFiltered: (dealers: Dealer[]) => void;
}

const DealerPicker: React.FC<DealerPickerProps> = ({ 
    selectedDealer: initialDealer,
    dealers,
    onDealersFiltered 
}) => {
    console.log('First dealer full data:', dealers[0]);

    const [selectedDealer, setSelectedDealer] = useState<string | null>(null);
    const [dealerDetails, setDealerDetails] = useState<DealerDetails | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editedDetails, setEditedDetails] = useState<DealerDetails | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [selectedDealerName, setSelectedDealerName] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState('');
    const [isDropdownVisible, setIsDropdownVisible] = useState(false);
    const detailsRef = useRef<HTMLDivElement>(null);
    const [filters, setFilters] = useState<Filters>({
        salesman: '',
        productLine: '',
        state: ''
    });

    const loadDealerDetails = async (dealerNumber: string) => {
        if (!dealerNumber) {
            setSelectedDealer(null);
            setDealerDetails(null);
            setSelectedDealerName('');
            return;
        }

        setLoading(true);
        try {
            const response = await axios.get<DealerDetails>(`${API_URL}/api/dealers/${dealerNumber}`);
            setSelectedDealer(dealerNumber);
            setDealerDetails(response.data);
            
            const dealer = dealers.find(d => d.KPMDealerNumber === dealerNumber);
            if (dealer) {
                setSelectedDealerName(dealer.DealershipName);
            }

            setTimeout(() => {
                detailsRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 100);

        } catch (err) {
            console.error('Fetch error:', err);
            setError('Failed to fetch dealer details');
        } finally {
            setLoading(false);
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
        if (!editedDetails) return;
        setIsSaving(true);
        try {
            const response = await axios.put<DealerDetails>(
                `${API_URL}/api/dealers/${selectedDealer}`, 
                editedDetails
            );
            
            setDealerDetails(response.data);
            setEditedDetails(response.data);
            setIsEditing(false);
            
        } catch (err) {
            console.error('Save error:', err);
            setError('Failed to save dealer details');
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

    // Add helper functions for getting unique values
    const getUniqueSalesmen = (dealers: Dealer[]): string[] => {
        const salesmen = dealers
            .filter(d => d.SalesmanName)
            .map(d => d.SalesmanName!);
        return Array.from(new Set(salesmen)).sort();
    };

    const getUniqueStates = (dealers: Dealer[]): string[] => {
        const states = dealers
            .filter(d => d.State)
            .map(d => d.State!);
        return Array.from(new Set(states)).sort();
    };

    const getUniqueProductLines = (dealers: Dealer[]): string[] => {
        const lines = dealers
            .filter(d => d.ProductLines)
            .flatMap(d => d.ProductLines!.split(',').map(line => line.trim()));
        return Array.from(new Set(lines)).sort();
    };

    const filteredDealers = dealers.filter(dealer => {
        const matchesSearch = 
            dealer.DealershipName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            dealer.KPMDealerNumber.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesSalesman = !filters.salesman || 
            dealer.SalesmanName?.trim() === filters.salesman.trim();

        const matchesProductLine = !filters.productLine || 
            (dealer.ProductLines?.split(',')
                .map(line => line.trim())
                .includes(filters.productLine.trim()));

        const matchesState = !filters.state || 
            dealer.State?.trim() === filters.state.trim();

        return matchesSearch && matchesSalesman && matchesProductLine && matchesState;
    });

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

    useEffect(() => {
        onDealersFiltered(filteredDealers);
    }, [filters, searchTerm, dealers, onDealersFiltered]);

    useEffect(() => {
        console.log('Raw dealer data:', {
            first: dealers[0],
            salesmen: dealers.map(d => d.SalesmanName).filter(Boolean),
            productLines: dealers.map(d => d.ProductLines).filter(Boolean)
        });
    }, [dealers]);

    if (loading) return <div>Loading dealer details...</div>;
    if (error) return <div>Error: {error}</div>;

    return (
        <div className="details-section">
            <div className="dealer-picker">
                <div className="filter-container">
                    <select 
                        value={filters.salesman}
                        onChange={(e) => setFilters({...filters, salesman: e.target.value})}
                    >
                        <option value="">All Salesmen</option>
                        {getUniqueSalesmen(dealers).map(name => (
                            <option key={name} value={name}>{name}</option>
                        ))}
                    </select>

                    <select 
                        value={filters.productLine}
                        onChange={(e) => setFilters({...filters, productLine: e.target.value})}
                    >
                        <option value="">All Product Lines</option>
                        {getUniqueProductLines(dealers).map(line => (
                            <option key={line} value={line}>{line}</option>
                        ))}
                    </select>

                    <select 
                        value={filters.state}
                        onChange={(e) => setFilters({...filters, state: e.target.value})}
                    >
                        <option value="">All States</option>
                        {getUniqueStates(dealers).map(state => (
                            <option key={state} value={state}>{state}</option>
                        ))}
                    </select>
                </div>

                <div className="search-container">
                    <input
                        type="text"
                        placeholder="Search dealers by name or number..."
                        value={searchTerm}
                        onChange={(e) => {
                            setSearchTerm(e.target.value);
                            setIsDropdownVisible(true);
                        }}
                        onFocus={() => setIsDropdownVisible(true)}
                    />
                    {isDropdownVisible && searchTerm && (
                        <div className="search-results">
                            {filteredDealers.length > 0 ? (
                                filteredDealers.map(dealer => (
                                    <div
                                        key={dealer.KPMDealerNumber}
                                        className="search-result-item"
                                        onClick={() => {
                                            loadDealerDetails(dealer.KPMDealerNumber);
                                            setSearchTerm('');
                                            setIsDropdownVisible(false);
                                        }}
                                    >
                                        <div className="dealer-name">{dealer.DealershipName}</div>
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
                            <section>
                                <h3>Basic Information</h3>
                                <p><strong>Dealer Number:</strong> {dealerDetails.KPMDealerNumber}</p>
                                {dealerDetails.DBA && (
                                    <p><strong>DBA:</strong> {dealerDetails.DBA}</p>
                                )}
                            </section>

                            <section>
                                <h3>Contact Information</h3>
                                <p><strong>Phone:</strong> {dealerDetails.contact.MainPhone}</p>
                                {dealerDetails.contact.FaxNumber && (
                                    <p><strong>Fax:</strong> {dealerDetails.contact.FaxNumber}</p>
                                )}
                                <p><strong>Email:</strong> {dealerDetails.contact.MainEmail}</p>
                            </section>
                            
                            <section>
                                <h3>Address</h3>
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
                            </section>

                            <section>
                                <h3>Salesman Information</h3>
                                <p><strong>Name:</strong> {dealerDetails.salesman.SalesmanName}</p>
                                <p><strong>Code:</strong> {dealerDetails.salesman.SalesmanCode}</p>
                            </section>

                            {dealerDetails.lines && dealerDetails.lines.length > 0 && (
                                <section>
                                    <h3>Lines Carried</h3>
                                    <ul className="lines-list">
                                        {dealerDetails.lines.map((line, index) => (
                                            <li key={index}>
                                                <strong>{line.LineName}</strong>
                                                {line.AccountNumber && (
                                                    <span> - Account: {line.AccountNumber}</span>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
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