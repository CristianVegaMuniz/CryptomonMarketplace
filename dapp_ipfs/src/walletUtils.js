import Swal from 'sweetalert2';

let alertVisible = false; // Track whether the alert is currently visible

// Function to show the persistent wallet connection alert
const showPersistentAlert = () => {
  if (alertVisible) return; // Prevent multiple alerts
  alertVisible = true; // Set the alert state to visible

  Swal.fire({
    title: 'Wallet Not Connected',
    text: 'Please connect your wallet to proceed.',
    icon: 'warning',
    showConfirmButton: true,
    confirmButtonText: 'Retry',
    allowOutsideClick: false, // Prevent closing by clicking outside
    allowEscapeKey: false,   // Prevent closing with escape key
    willClose: () => {
      alertVisible = false; // Reset the alert state when it closes
      const userAddress = window.ethereum?.selectedAddress;
      if (!userAddress) {
        setTimeout(() => showPersistentAlert(), 500); // Reopen after a small delay if wallet is still not connected
      }
    },
  });
};

export const checkWalletConnection = async (setUserAddress, provider) => {
  try {
    const accounts = await provider.send('eth_accounts', []);
    if (accounts.length > 0) {
      setUserAddress(accounts[0]);
      Swal.close(); // Cerrar la alerta
    } else {
      const newAccounts = await provider.send('eth_requestAccounts', []); // Pedir reconexión automáticamente
      if (newAccounts.length > 0) {
        setUserAddress(newAccounts[0]);
        Swal.close();
      } else if (!alertVisible) {
        showPersistentAlert(); // Mostrar alerta persistente si sigue sin conexión
      }
    }
  } catch (error) {
    console.error('Error connecting wallet:', error);
  }
};

// Add event listener for wallet connection
export const setupWalletListener = (setUserAddress) => {
  if (window.ethereum) {
    window.ethereum.on('accountsChanged', (accounts) => {
      if (accounts.length > 0) {
        setUserAddress(accounts[0]);
        Swal.close(); // Close the alert once logged in
      } else {
        showPersistentAlert(); // Show the alert if wallet is disconnected
      }
    });
  }
};
