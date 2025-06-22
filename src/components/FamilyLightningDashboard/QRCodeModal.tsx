import { Copy, Download, XCircle } from "lucide-react";
import QRCode from "qrcode";
import React, { useEffect, useRef, useState } from "react";
import { SatnamFamilyMember } from "../types/shared";

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  familyMembers: SatnamFamilyMember[];
  selectedMember: string | null;
  copiedAddress: string | null;
  onCopyAddress: (address: string) => void;
}

const QRCodeModal: React.FC<QRCodeModalProps> = ({
  isOpen,
  onClose,
  familyMembers,
  selectedMember,
  copiedAddress,
  onCopyAddress,
}) => {
  const [qrCodeDataURL, setQrCodeDataURL] = useState<string>("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const member = familyMembers.find(m => m.id === selectedMember);

  useEffect(() => {
    if (isOpen && member) {
      generateQRCode(member.lightningAddress);
    }
  }, [isOpen, member]);

  const generateQRCode = async (lightningAddress: string) => {
    try {
      // Generate QR code with lightning: prefix for better wallet compatibility
      const qrData = `lightning:${lightningAddress}`;
      const dataURL = await QRCode.toDataURL(qrData, {
        width: 300,
        margin: 2,
        color: {
          dark: '#1f2937', // Dark gray
          light: '#ffffff', // White
        },
        errorCorrectionLevel: 'M',
      });
      setQrCodeDataURL(dataURL);
    } catch (error) {
      console.error('Error generating QR code:', error);
    }
  };

  const downloadQRCode = () => {
    if (!qrCodeDataURL || !member) return;
    
    const link = document.createElement('a');
    link.download = `${member.username}-lightning-address-qr.png`;
    link.href = qrCodeDataURL;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen || !member) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-purple-900 rounded-2xl p-8 max-w-md w-full border border-yellow-400/20 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white hover:text-purple-200 transition-colors duration-200"
          aria-label="Close QR code modal"
        >
          <XCircle className="h-6 w-6" />
        </button>

        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-2">Lightning Address QR Code</h2>
          <p className="text-purple-200 mb-6">
            Scan to send payments to <span className="font-semibold text-white">{member.username}</span>
          </p>

          {/* QR Code Display */}
          <div className="bg-white rounded-xl p-6 mb-6 inline-block">
            {qrCodeDataURL ? (
              <img 
                src={qrCodeDataURL} 
                alt={`QR Code for ${member.username}'s Lightning Address`}
                className="w-64 h-64 mx-auto"
              />
            ) : (
              <div className="w-64 h-64 flex items-center justify-center bg-gray-100 rounded-lg">
                <div className="animate-spin w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full"></div>
              </div>
            )}
          </div>

          {/* Lightning Address Display */}
          <div className="bg-white/10 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-purple-200 text-sm">Lightning Address</span>
              <button
                onClick={() => onCopyAddress(member.lightningAddress)}
                className="text-purple-200 hover:text-white transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 focus:ring-offset-transparent rounded p-1"
                aria-label={`Copy lightning address for ${member.username}`}
                title={copiedAddress === member.lightningAddress ? "Copied!" : "Copy address"}
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <p className="text-yellow-400 font-mono text-sm break-all">{member.lightningAddress}</p>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-4">
            <button
              onClick={onClose}
              className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300"
            >
              Close
            </button>
            <button
              onClick={downloadQRCode}
              disabled={!qrCodeDataURL}
              className="flex-1 bg-purple-700 hover:bg-purple-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
              aria-label="Download QR code image"
            >
              <Download className="h-5 w-5" />
              <span>Download</span>
            </button>
          </div>

          {/* Instructions */}
          <div className="mt-6 text-left">
            <h3 className="text-white font-semibold mb-2 text-sm">How to use:</h3>
            <ul className="text-purple-200 text-xs space-y-1">
              <li>• Open any Lightning wallet app</li>
              <li>• Scan this QR code to send a payment</li>
              <li>• Or copy the Lightning address manually</li>
              <li>• Enter the amount and send</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QRCodeModal;