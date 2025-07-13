import { X } from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import { useSessionStore } from "../store/useSessionStore";

const ChatHeader = () => {
    const { selectedUser } = useChatStore();
    const { sessionEstablished, endSession } = useSessionStore();

    const handleClose = async () => {
        await endSession();
        useChatStore.setState({ selectedUser: null });
        useSessionStore.setState({ selectedUser: null });
    };

    return (
        <div className="p-2.5 border-b border-base-300 flex items-center justify-between">
            <div>
                <h3 className="font-medium">{selectedUser.fullName}</h3>
            </div>
            
            <button 
                onClick={handleClose}
                className="btn btn-sm btn-ghost hover:btn-error"
                title="Close Chat"
            >
                <X size={18} />
            </button>
        </div>
    );
};

export default ChatHeader;
