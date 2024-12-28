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

    const handleDealerChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
        const dealerNumber = event.target.value;
        
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

    useEffect(() => {
        if (initialDealer) {
            handleDealerChange(initialDealer);
        }
    }, [initialDealer]);

    if (loading) return <div>Loading...</div>;
    if (error) return <div>Error: {error}</div>;

    return (
        <div className="details-section">
            {selectedDealerName && (
                <h2 className="dealer-title">{selectedDealerName}</h2>
            )}
            <div className="dealer-picker">
                <select 
                    value={selectedDealer || ''} 
                    onChange={handleDealerChange}
                    style={{ width: '100%' }}
                >
                    <option value="">Select a Dealer</option>
                    {dealers.map(dealer => (
                        <option key={dealer.KPMDealerNumber} value={dealer.KPMDealerNumber}>
                            {dealer.DealershipName}
                        </option>
                    ))}
                </select>
            </div>

            {dealerDetails && (
                <div className="dealer-details">
                    <section>
                        <h3>Contact Information</h3>
                        <p>{dealerDetails.contact.MainPhone}</p>
                        <p>{dealerDetails.contact.MainEmail}</p>
                    </section>
                    
                    <section>
                        <h3>Address</h3>
                        <p>{dealerDetails.address.StreetAddress}</p>
                        <p>{dealerDetails.address.City}, {dealerDetails.address.State} {dealerDetails.address.ZipCode}</p>
                    </section>
                    
                    {/* Other sections */}
                </div>
            )}
        </div>
    );
};

export default DealerPicker; 