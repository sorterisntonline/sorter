import { execSync } from 'child_process';

export async function setupDocker() {
  console.log('Setting up Docker for the current user (Ubuntu/Debian)...');
  console.log('This will install Docker and add your user to the docker group.');
  console.log('You may need to enter your password for sudo commands.');
  
  try {
    console.log('Installing Docker...');
    execSync('sudo apt install -f docker.io', { stdio: 'inherit' });
    
    console.log('Adding user to docker group...');
    execSync('sudo groupadd -f docker', { stdio: 'inherit' });
    execSync(`sudo usermod -aG docker ${process.env.USER}`, { stdio: 'inherit' });
    
    console.log('Activating docker group...');
    execSync('newgrp docker', { stdio: 'inherit' });
    
    console.log('Testing Docker installation...');
    execSync('docker run hello-world', { stdio: 'inherit' });
    
    console.log('Docker setup completed successfully!');
    console.log('Note: You may need to log out and log back in for group changes to take effect.');
  } catch (error) {
    console.error('Error during Docker setup:', error);
    process.exit(1);
  }
}
