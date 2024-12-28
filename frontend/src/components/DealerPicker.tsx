import * as React from 'react';
import { useState, useEffect } from 'react';
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
        LineName: string;
        AccountNumber: string;
    }>;
    salesman: {
        SalesmanName: string;
        SalesmanCode: string;
    };
}

const API_URL = 'http://35.212.41.99:3002';

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

    useEffect(() => {
        const fetchDealers = async () => {
            try {
                const response = await axios.get<Dealer[]>(`${API_URL}/api/dealers`);
                setDealers(response.data);
                setLoading(false);
            } catch (err) {
                setError('Failed to fetch dealers');
                setLoading(false);
            }
        };

        fetchDealers();
    }, []);

    const loadDealerDetails = async (dealerNumber: string) => {
        if (!dealerNumber) {
            setSelectedDealer(null);
            setDealerDetails(null);
            setSelectedDealerName('');
            return;
        }

        try {
            console.log('Fetching dealer:', dealerNumber);
            const response = await axios.get<DealerDetails>(`${API_URL}/api/dealers/${dealerNumber}`);
            console.log('Received dealer details:', response.data);
            setSelectedDealer(dealerNumber);
            setDealerDetails(response.data);
            
            // Set the dealer name for the title
            const dealer = dealers.find(d => d.KPMDealerNumber === dealerNumber);
            if (dealer) {
                setSelectedDealerName(dealer.DealershipName);
            }
        } catch (err) {
            console.error('Fetch error:', err);
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
        if (!editedDetails) return;
        setIsSaving(true);
        try {
            console.log('Sending data to server:', editedDetails);
            
            const response = await axios.put<DealerDetails>(
                `${API_URL}/api/dealers/${selectedDealer}`, 
                editedDetails
            );
            console.log('Server response:', response.data);
            
            // Update both states with the response data
            setDealerDetails(response.data);
            setEditedDetails(response.data);
            setIsEditing(false);
            
            // Refresh the dealers list
            const dealersResponse = await axios.get<Dealer[]>(`${API_URL}/api/dealers`);
            console.log('Updated dealers list:', dealersResponse.data);
            setDealers(dealersResponse.data);
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

    const filteredDealers = dealers.filter(dealer => 
        dealer.DealershipName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        dealer.KPMDealerNumber.toLowerCase().includes(searchTerm.toLowerCase())
    );

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
                <h2 className="dealer-title">{selectedDealerName}</h2>
            )}

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
    );
};

export default DealerPicker; 