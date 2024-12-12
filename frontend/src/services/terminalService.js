// services/TerminalService.js
class TerminalService {
    constructor() {
        this.API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
    }

    async createTerminalSession(projectId) {
        console.log('터미널 세션 생성 요청:', projectId);
        try {
            const response = await fetch(`${this.API_URL}/terminal/create`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ projectId })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('터미널 세션 생성 응답:', data);
            return data;
        } catch (error) {
            console.error('터미널 세션 생성 실패:', error);
            throw error;
        }
    }

    async terminateTerminalSession(containerId) {
        console.log('터미널 세션 종료 요청:', containerId);
        try {
            const response = await fetch(`${this.API_URL}/terminal/terminate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ containerId })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('터미널 세션 종료 응답:', data);
            return data;
        } catch (error) {
            console.error('터미널 세션 종료 실패:', error);
            throw error;
        }
    }
}

export default new TerminalService();