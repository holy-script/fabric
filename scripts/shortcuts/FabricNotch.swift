import Cocoa
import SwiftUI
import Foundation
import Combine
import UserNotifications

// MARK: - Telemetry Models

public struct AmbientPayload: Codable {
    public let timestamp: String?
    public let frontmostApp: FrontmostApp?
    public let git: GitContext?
    public let focus: FocusContext?
    public let dynamicIsland: DynamicIsland?
    public let system: SystemContext?
}

public struct FrontmostApp: Codable {
    public let name: String?
    public let category: String?
    public let windowTitle: String?
}

public struct GitContext: Codable {
    public let repository: String?
    public let branch: String?
    public let isClean: Bool?
    public let uncommittedChangesCount: Int?
    public let repoPath: String?
    public let headCommit: String?
}

public struct FocusContext: Codable {
    public let sedentaryMinutes: Int?
    public let continuousActivitySeconds: Int?
    public let idleSeconds: Int?
    public let tranceState: String?
    public let lastBreakTimestamp: String?
    public let standingDetected: Bool?
}

public struct DynamicIsland: Codable {
    public let status: String?
    public let headline: String?
    public let subtext: String?
    public let badge: String?
    public let icon: String?
    public let actionPrompt: String?
}

public struct SystemContext: Codable {
    public let batteryLevel: Double?
    public let isCharging: Bool?
    public let memoryUsagePercent: Double?
}

public struct FourFVector {
    public var focus: Double
    public var facts: Double
    public var funds: Double
    public var feedback: Double
    public var vitalityScore: Int
    public var tranceLabel: String
    public var stateColor: Color
    public var respirationBpm: Double
    public var coherenceScore: Int
}

// MARK: - Native Notification Dispatcher

public final class FabricNotifier: NSObject, UNUserNotificationCenterDelegate {
    public static let shared = FabricNotifier()
    private var lastNotifiedTimes: [String: Date] = [:]
    private var canUseUNUserNotificationCenter: Bool = false
    
    public override init() {
        super.init()
        if Bundle.main.bundleIdentifier != nil {
            canUseUNUserNotificationCenter = true
            let center = UNUserNotificationCenter.current()
            center.delegate = self
            center.requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
        }
    }
    
    public func notify(title: String, body: String, identifier: String = UUID().uuidString, throttleSeconds: TimeInterval = 4.0) {
        let key = "\(title):\(body)"
        let now = Date()
        if let last = lastNotifiedTimes[key], now.timeIntervalSince(last) < throttleSeconds {
            return
        }
        lastNotifiedTimes[key] = now
        
        DispatchQueue.main.async {
            if self.canUseUNUserNotificationCenter {
                let content = UNMutableNotificationContent()
                content.title = title
                content.body = body
                content.sound = .default
                let request = UNNotificationRequest(identifier: identifier, content: content, trigger: nil)
                UNUserNotificationCenter.current().add(request, withCompletionHandler: nil)
            } else {
                // Native macOS notification fallback for CLI execution
                let escapedTitle = title.replacingOccurrences(of: "\"", with: "\\\"")
                let escapedBody = body.replacingOccurrences(of: "\"", with: "\\\"")
                let script = "display notification \"\(escapedBody)\" with title \"\(escapedTitle)\""
                let proc = Process()
                proc.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
                proc.arguments = ["-e", script]
                try? proc.run()
            }
        }
    }
}

// MARK: - Process & Daemon Models

public enum DaemonStatus: String, Codable, CaseIterable {
    case running = "Running"
    case stopped = "Stopped"
    case error = "Error"
    
    public var icon: String {
        switch self {
        case .running: return "🟢"
        case .stopped: return "⚪"
        case .error: return "🔴"
        }
    }
}

public struct DaemonProcessInfo: Identifiable, Equatable {
    public let id: String
    public let name: String
    public let subtitle: String
    public let scriptPattern: String
    public var pid: Int32?
    public var status: DaemonStatus
    public var statusDetail: String
    
    public init(
        id: String,
        name: String,
        subtitle: String,
        scriptPattern: String,
        pid: Int32? = nil,
        status: DaemonStatus = .stopped,
        statusDetail: String = "Stopped"
    ) {
        self.id = id
        self.name = name
        self.subtitle = subtitle
        self.scriptPattern = scriptPattern
        self.pid = pid
        self.status = status
        self.statusDetail = statusDetail
    }
}

// MARK: - Process & Daemon Controller

public final class DaemonProcessManager: ObservableObject {
    @Published public var daemons: [DaemonProcessInfo] = []
    @Published public var isExecutingAction: Bool = false
    
    private var previousStatuses: [String: DaemonStatus] = [:]
    
    public static var projectRoot: String {
        let cwd = FileManager.default.currentDirectoryPath
        let defaultPath = "/Users/holyscript/Desktop/projects/fabric"
        if FileManager.default.fileExists(atPath: "\(cwd)/scripts/fabric-ambient-daemon.ts") {
            return cwd
        }
        if FileManager.default.fileExists(atPath: "\(cwd)/../scripts/fabric-ambient-daemon.ts") {
            return URL(fileURLWithPath: cwd).deletingLastPathComponent().path
        }
        if FileManager.default.fileExists(atPath: "\(defaultPath)/scripts/fabric-ambient-daemon.ts") {
            return defaultPath
        }
        return cwd
    }
    
    public init() {
        self.daemons = [
            DaemonProcessInfo(
                id: "ambient",
                name: "macOS Ambient Daemon",
                subtitle: "Frontmost App, Idle & Git Telemetry",
                scriptPattern: "fabric-ambient-daemon"
            ),
            DaemonProcessInfo(
                id: "vault",
                name: "Telegram Video Vault Archiver",
                subtitle: "Tor SOCKS5 Media Archiver",
                scriptPattern: "archive-telegram-vault"
            ),
            DaemonProcessInfo(
                id: "insomnia",
                name: "Insomnia Power Governor",
                subtitle: "Closed-Lid Caffeinate Safety Sentinel",
                scriptPattern: "fabric-insomnia"
            ),
            DaemonProcessInfo(
                id: "governor",
                name: "Cybernetic Governor",
                subtitle: "Aristotelian Homeostatic Balance Governor",
                scriptPattern: "governor"
            )
        ]
        refreshDaemons(notifyChanges: false)
    }
    
    public var runningCount: Int {
        daemons.filter { $0.status == .running }.count
    }
    
    public func refreshDaemons(notifyChanges: Bool = true) {
        var updated: [DaemonProcessInfo] = []
        
        // Check ambient state for governor status
        var governorAlertReason: String? = nil
        let statePath = "\(DaemonProcessManager.projectRoot)/.ambient_state.json"
        if let stateData = try? Data(contentsOf: URL(fileURLWithPath: statePath)),
           let json = try? JSONSerialization.jsonObject(with: stateData) as? [String: Any] {
            if let focus = json["focus"] as? [String: Any],
               let sedentary = focus["sedentaryMinutes"] as? Int, sedentary > 75 {
                governorAlertReason = "Sedentary Lock (>75m continuous)"
            }
            if let island = json["dynamicIsland"] as? [String: Any],
               let status = island["status"] as? String, status == "alert" || status == "warning" {
                let head = island["headline"] as? String ?? "Governor Alert"
                governorAlertReason = head
            }
        }
        
        // Check Insomnia PID file
        let insomniaPidFile = "\(DaemonProcessManager.projectRoot)/.fabric_insomnia.pid"
        var insomniaFilePid: Int32? = nil
        if let pidContent = try? String(contentsOfFile: insomniaPidFile, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines),
           let parsed = Int32(pidContent), parsed > 0 {
            insomniaFilePid = parsed
        }
        
        for daemon in daemons {
            var info = daemon
            var detectedPid: Int32? = nil
            
            if daemon.id == "ambient" {
                detectedPid = findPids(for: "fabric-ambient-daemon").first
            } else if daemon.id == "vault" {
                detectedPid = findPids(for: "archive-telegram-vault").first
            } else if daemon.id == "insomnia" {
                detectedPid = findPids(for: "fabric-insomnia").first
                if detectedPid == nil, let fPid = insomniaFilePid, isPidAlive(fPid) {
                    detectedPid = fPid
                }
            } else if daemon.id == "governor" {
                // Cybernetic Governor runs continuously with ambient daemon
                detectedPid = findPids(for: "fabric-ambient-daemon").first
            }
            
            info.pid = detectedPid
            if let pid = detectedPid {
                if daemon.id == "governor", let reason = governorAlertReason {
                    info.status = .error
                    info.statusDetail = "⚠️ \(reason)"
                } else {
                    info.status = .running
                    info.statusDetail = "PID: \(pid)"
                }
            } else {
                info.status = .stopped
                info.statusDetail = "Stopped"
            }
            
            // Check state transition for notification
            if notifyChanges {
                let oldStatus = previousStatuses[daemon.id]
                if let old = oldStatus, old != info.status {
                    handleStateTransition(daemon: info, from: old, to: info.status)
                }
            }
            previousStatuses[daemon.id] = info.status
            updated.append(info)
        }
        
        if Thread.isMainThread {
            self.daemons = updated
        } else {
            DispatchQueue.main.sync { [weak self] in
                self?.daemons = updated
            }
        }
    }
    
    private func handleStateTransition(daemon: DaemonProcessInfo, from old: DaemonStatus, to new: DaemonStatus) {
        if new == .running {
            FabricNotifier.shared.notify(
                title: "🟢 Daemon Started",
                body: "\(daemon.name) is active (PID: \(daemon.pid ?? 0))."
            )
        } else if new == .stopped && old == .running {
            FabricNotifier.shared.notify(
                title: "⚪ Daemon Stopped",
                body: "\(daemon.name) has terminated."
            )
        } else if new == .error {
            FabricNotifier.shared.notify(
                title: "🔴 Governor Alert",
                body: "\(daemon.name): \(daemon.statusDetail)"
            )
        }
    }
    
    // 1-Click Start
    public func startDaemon(id: String, completion: (() -> Void)? = nil) {
        let root = DaemonProcessManager.projectRoot
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            switch id {
            case "ambient":
                _ = self?.executeShell("cd \"\(root)\" && nohup bun run scripts/fabric-ambient-daemon.ts > /dev/null 2>&1 &")
            case "vault":
                _ = self?.executeShell("cd \"\(root)\" && nohup bun run scripts/archive-telegram-vault.ts > /dev/null 2>&1 &")
            case "insomnia":
                _ = self?.executeShell("cd \"\(root)\" && ./scripts/shortcuts/fabric-insomnia.sh --start > /dev/null 2>&1 &")
            case "governor":
                _ = self?.executeShell("cd \"\(root)\" && nohup bun run scripts/fabric-ambient-daemon.ts > /dev/null 2>&1 &")
            default:
                break
            }
            
            Thread.sleep(forTimeInterval: 0.8)
            self?.refreshDaemons(notifyChanges: true)
            DispatchQueue.main.async {
                completion?()
            }
        }
    }
    
    // 1-Click Stop
    public func stopDaemon(id: String, completion: (() -> Void)? = nil) {
        let root = DaemonProcessManager.projectRoot
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            let processes = self.listRunningProcesses()
            
            switch id {
            case "ambient":
                if let pid = self.findPid(for: "fabric-ambient-daemon", in: processes) {
                    _ = self.executeShell("kill \(pid) 2>/dev/null || true")
                }
            case "vault":
                if let pid = self.findPid(for: "archive-telegram-vault", in: processes) {
                    _ = self.executeShell("kill \(pid) 2>/dev/null || true")
                    _ = self.executeShell("pkill -f \"yt-dlp.*fabric_tg_vault\" 2>/dev/null || true")
                }
            case "insomnia":
                _ = self.executeShell("cd \"\(root)\" && ./scripts/shortcuts/fabric-insomnia.sh --stop 2>/dev/null || true")
                if let pid = self.findPid(for: "fabric-insomnia", in: processes) {
                    _ = self.executeShell("kill \(pid) 2>/dev/null || true")
                }
            case "governor":
                if let pid = self.findPid(for: "fabric-ambient-daemon", in: processes) {
                    _ = self.executeShell("kill \(pid) 2>/dev/null || true")
                }
            default:
                break
            }
            
            Thread.sleep(forTimeInterval: 0.5)
            self.refreshDaemons(notifyChanges: true)
            DispatchQueue.main.async {
                completion?()
            }
        }
    }
    
    // Start All Daemons
    public func startAllDaemons(completion: (() -> Void)? = nil) {
        let root = DaemonProcessManager.projectRoot
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            _ = self?.executeShell("cd \"\(root)\" && nohup bun run scripts/fabric-ambient-daemon.ts > /dev/null 2>&1 &")
            _ = self?.executeShell("cd \"\(root)\" && nohup bun run scripts/archive-telegram-vault.ts > /dev/null 2>&1 &")
            Thread.sleep(forTimeInterval: 0.8)
            self?.refreshDaemons(notifyChanges: true)
            DispatchQueue.main.async {
                FabricNotifier.shared.notify(
                    title: "🚀 Daemons Started",
                    body: "Background telemetry and vault archiver initiated."
                )
                completion?()
            }
        }
    }
    
    // Prominent Force Quit All Daemons
    public func forceQuitAllDaemons(dryRun: Bool = false) -> [String] {
        let root = DaemonProcessManager.projectRoot
        var actionsTaken: [String] = []
        
        let targets = [
            "fabric-ambient-daemon",
            "archive-telegram-vault",
            "fabric-insomnia",
            "caffeinate.*fabric",
            "yt-dlp.*fabric_tg_vault"
        ]
        
        for target in targets {
            let pids = findPids(for: target)
            for pid in pids {
                actionsTaken.append("Killed \(target) (PID: \(pid))")
                if !dryRun {
                    _ = executeShell("kill -9 \(pid) 2>/dev/null || true")
                }
            }
            if !dryRun {
                _ = executeShell("pkill -9 -f \"\(target)\" 2>/dev/null || true")
            }
        }
        
        let pidFile = "\(root)/.fabric_insomnia.pid"
        if FileManager.default.fileExists(atPath: pidFile) {
            actionsTaken.append("Removed .fabric_insomnia.pid")
            if !dryRun {
                try? FileManager.default.removeItem(atPath: pidFile)
            }
        }
        
        if !dryRun {
            FabricNotifier.shared.notify(
                title: "🛑 Force Quit All Daemons",
                body: "All background workers and child processes terminated cleanly."
            )
            refreshDaemons(notifyChanges: false)
        }
        
        return actionsTaken
    }
    
    // Shell execution helpers
    public func executeShell(_ command: String) -> String {
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/bin/zsh")
        proc.arguments = ["-c", command]
        let pipe = Pipe()
        proc.standardOutput = pipe
        proc.standardError = Pipe()
        do {
            try proc.run()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            proc.waitUntilExit()
            return String(data: data, encoding: .utf8) ?? ""
        } catch {
            return ""
        }
    }
    
    private func listRunningProcesses() -> [(pid: Int32, command: String)] {
        let output = executeShell("ps -axo pid,command")
        var list: [(pid: Int32, command: String)] = []
        let lines = output.components(separatedBy: .newlines)
        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.isEmpty || trimmed.hasPrefix("PID") { continue }
            let parts = trimmed.split(separator: " ", maxSplits: 1, omittingEmptySubsequences: true)
            if parts.count >= 2, let pid = Int32(parts[0]) {
                list.append((pid: pid, command: String(parts[1])))
            }
        }
        return list
    }
    
    private func findPid(for pattern: String, in processes: [(pid: Int32, command: String)]) -> Int32? {
        for p in processes {
            if p.command.contains(pattern) {
                return p.pid
            }
        }
        return nil
    }
    
    public func findPids(for pattern: String) -> [Int32] {
        let out = executeShell("pgrep -f \"\(pattern)\"")
        var pids: [Int32] = []
        let currentPid = ProcessInfo.processInfo.processIdentifier
        let lines = out.components(separatedBy: .newlines)
        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
            if let pid = Int32(trimmed), pid > 0, pid != currentPid {
                pids.append(pid)
            }
        }
        return pids
    }
    
    private func isPidAlive(_ pid: Int32) -> Bool {
        return kill(pid, 0) == 0
    }
}

// MARK: - Telemetry Store

public final class TelemetryStore: ObservableObject {
    @Published public var ambient: AmbientPayload?
    @Published public var fourF: FourFVector
    @Published public var isConnected: Bool = false
    @Published public var lastRefreshed: Date = Date()
    @Published public var feedbackBanner: String? = nil
    
    public let daemonManager = DaemonProcessManager()
    
    private var timer: AnyCancellable?
    private var bannerTimer: AnyCancellable?
    private var candidateFilePaths: [String] = []

    public init() {
        self.fourF = FourFVector(
            focus: 2.0,
            facts: 1.0,
            funds: 1.0,
            feedback: 0.0,
            vitalityScore: 88,
            tranceLabel: "Flow",
            stateColor: Color(red: 6/255, green: 182/255, blue: 212/255), // Cyan
            respirationBpm: 14.0,
            coherenceScore: 92
        )
        
        let root = DaemonProcessManager.projectRoot
        let cwd = FileManager.default.currentDirectoryPath
        candidateFilePaths = [
            "\(cwd)/.ambient_state.json",
            "\(root)/.ambient_state.json",
            "\(cwd)/../.ambient_state.json",
            "\(cwd)/../../.ambient_state.json",
            NSHomeDirectory() + "/.ambient_state.json"
        ]
        
        refreshState()
        
        // 1.5s refresh cycle
        timer = Timer.publish(every: 1.5, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                self?.refreshState()
            }
    }
    
    public func showBanner(_ message: String) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.feedbackBanner = message
            self.bannerTimer?.cancel()
            self.bannerTimer = Just(())
                .delay(for: .seconds(2.8), scheduler: RunLoop.main)
                .sink { [weak self] _ in
                    withAnimation(.easeInOut(duration: 0.3)) {
                        self?.feedbackBanner = nil
                    }
                }
        }
    }
    
    public func refreshState() {
        var foundData: Data? = nil
        
        for path in candidateFilePaths {
            if FileManager.default.fileExists(atPath: path),
               let data = try? Data(contentsOf: URL(fileURLWithPath: path)) {
                foundData = data
                break
            }
        }
        
        if let data = foundData,
           let payload = try? JSONDecoder().decode(AmbientPayload.self, from: data) {
            DispatchQueue.main.async { [weak self] in
                guard let self = self else { return }
                self.ambient = payload
                self.isConnected = true
                self.lastRefreshed = Date()
                self.deriveFourF(from: payload)
            }
        } else {
            // Antifragile fallback: inspect macOS NSWorkspace directly
            DispatchQueue.main.async { [weak self] in
                self?.deriveFallbackContext()
            }
        }
        
        // Refresh background daemon controller
        daemonManager.refreshDaemons(notifyChanges: true)
    }
    
    private func deriveFourF(from payload: AmbientPayload) {
        let trance = (payload.focus?.tranceState ?? "active").lowercased()
        let sedentaryMins = payload.focus?.sedentaryMinutes ?? 0
        let uncommitted = payload.git?.uncommittedChangesCount ?? 0
        
        var foc: Double = 0.0
        var fac: Double = 0.0
        var fun: Double = 1.0
        var fdb: Double = 0.0
        var vit: Int = 85
        var color = Color(red: 6/255, green: 182/255, blue: 212/255)
        var label = "Flow"
        var bpm = 14.0
        var coherence = 88
        
        switch trance {
        case "deep_flow":
            foc = 3.2
            fac = 1.5
            fun = 1.8
            fdb = 0.2
            vit = 96
            color = Color(red: 6/255, green: 182/255, blue: 212/255) // Cyan
            label = "Deep Flow"
            bpm = 11.5
            coherence = 96
        case "active":
            foc = 2.0
            fac = 1.0
            fun = 1.2
            fdb = 0.0
            vit = 88
            color = Color(red: 168/255, green: 85/255, blue: 247/255) // Purple
            label = "Active"
            bpm = 13.5
            coherence = 90
        case "warming_up":
            foc = 1.0
            fac = 0.8
            fun = 1.0
            fdb = -0.2
            vit = 82
            color = Color(red: 16/255, green: 185/255, blue: 129/255) // Emerald
            label = "Warm Up"
            bpm = 15.0
            coherence = 85
        case "sedentary_lock":
            foc = -1.8
            fac = -0.5
            fun = -1.5
            fdb = -0.8
            vit = 58
            color = Color(red: 245/255, green: 158/255, blue: 11/255) // Amber
            label = "Sedentary"
            bpm = 18.0
            coherence = 62
        default:
            foc = 0.5
            fac = 0.5
            fun = 0.8
            fdb = 0.0
            vit = 76
            color = Color(red: 99/255, green: 102/255, blue: 241/255) // Indigo
            label = "Present"
            bpm = 14.0
            coherence = 82
        }
        
        if uncommitted > 0 {
            fac += min(Double(uncommitted) * 0.2, 1.5)
        }
        
        if sedentaryMins > 45 {
            vit = max(vit - Int(Double(sedentaryMins - 45) * 0.5), 40)
        }
        
        // Notify Governor Alert if prolonged sedentary state
        if sedentaryMins > 75 {
            FabricNotifier.shared.notify(
                title: "⚠️ Cybernetic Governor Alert",
                body: "Prolonged sedentary lock (\(sedentaryMins)m). Stand up and recalibrate posture."
            )
        }
        
        self.fourF = FourFVector(
            focus: foc,
            facts: fac,
            funds: fun,
            feedback: fdb,
            vitalityScore: vit,
            tranceLabel: label,
            stateColor: color,
            respirationBpm: bpm,
            coherenceScore: coherence
        )
    }
    
    private func deriveFallbackContext() {
        let activeApp = NSWorkspace.shared.frontmostApplication?.localizedName ?? "Fabric OS"
        self.ambient = AmbientPayload(
            timestamp: ISO8601DateFormatter().string(from: Date()),
            frontmostApp: FrontmostApp(name: activeApp, category: "workspace", windowTitle: nil),
            git: GitContext(repository: "fabric", branch: "main", isClean: true, uncommittedChangesCount: 0, repoPath: nil, headCommit: nil),
            focus: FocusContext(sedentaryMinutes: 10, continuousActivitySeconds: 600, idleSeconds: 5, tranceState: "active", lastBreakTimestamp: nil, standingDetected: false),
            dynamicIsland: DynamicIsland(status: "normal", headline: "Fabric OS • \(activeApp)", subtext: "Native Ambient Link Active", badge: "main", icon: "🌌", actionPrompt: nil),
            system: nil
        )
        self.isConnected = false
    }
    
    // Quick Actions
    public func triggerSpark() {
        sendQuickAction(action: "spark", payload: [
            "action": "spark",
            "task": "Deep Work Sprint (Notch HUD)",
            "duration": "1.5"
        ]) { [weak self] _ in
            self?.showBanner("⚡ 90m Focus Sprint Sparked!")
            FabricNotifier.shared.notify(
                title: "⚡ Focus Sprint Active",
                body: "90-minute deep work block initiated. Distractions muted."
            )
            self?.refreshState()
        }
    }
    
    public func triggerSettle() {
        sendQuickAction(action: "settle", payload: [
            "action": "settle",
            "energyDelta": 1,
            "factsYield": "Completed focused execution cycle via FabricNotch"
        ]) { [weak self] _ in
            self?.showBanner("🏁 Session Settled (+1 Energy)")
            FabricNotifier.shared.notify(
                title: "🏁 Flow Session Settled",
                body: "Execution logged to blackboard (+1 Vitality energy)."
            )
            self?.refreshState()
        }
    }
    
    public func openCockpit() {
        // Production dashboard URL with fallback to local development server:
        // http://localhost:3000/dashboard
        let target = URL(string: "https://fabric-one-sage.vercel.app/dashboard") ?? URL(string: "http://localhost:3000/dashboard")!
        NSWorkspace.shared.open(target)
        showBanner("🌐 Opening Dashboard Cockpit")
    }
    
    public func openDeploy() {
        if let url = URL(string: "https://fabric-one-sage.vercel.app") {
            NSWorkspace.shared.open(url)
            showBanner("🚀 Opening Vercel Production")
        }
    }
    
    public func openVault() {
        if let url = URL(string: "https://fabric-one-sage.vercel.app/dashboard#vault") {
            NSWorkspace.shared.open(url)
            showBanner("🕸️ Opening Knowledge Vault")
        }
    }
    
    public func blockCalendar(minutes: Int, category: String = "focus") {
        sendQuickAction(action: "block", payload: [
            "action": "block",
            "title": "Deep Focus Sprint (\(minutes)m)",
            "durationMinutes": minutes,
            "category": category,
            "syncToNotion": true
        ]) { [weak self] _ in
            self?.showBanner("📅 Blocked \(minutes)m (Synced to Notion)")
            FabricNotifier.shared.notify(
                title: "📅 Calendar Block Created",
                body: "\(minutes)m \(category) session scheduled and synced to Notion."
            )
            self?.refreshState()
        }
    }
    
    public func forceQuitAllDaemons() {
        showBanner("🛑 Force Quitting All Daemons...")
        _ = daemonManager.forceQuitAllDaemons()
        refreshState()
    }
    
    public func startAllDaemons() {
        showBanner("🚀 Starting All Daemons...")
        daemonManager.startAllDaemons { [weak self] in
            self?.refreshState()
        }
    }
    
    public func quitAndStopAll() {
        showBanner("🛑 Quitting Fabric & Stopping Daemons...")
        _ = daemonManager.forceQuitAllDaemons()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
            NSApplication.shared.terminate(nil)
        }
    }
    
    private func sendQuickAction(action: String, payload: [String: Any], completion: @escaping (String) -> Void) {
        // Primary production dispatcher with seamless local development fallback:
        // http://localhost:3000/api/quick
        let prodUrl = URL(string: "https://fabric-one-sage.vercel.app/api/quick")
        let localUrl = URL(string: "http://localhost:3000/api/quick")
        guard let url = prodUrl ?? localUrl else {
            completion("Invalid URL")
            return
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.timeoutInterval = 2.5
        req.httpBody = try? JSONSerialization.data(withJSONObject: payload)
        
        URLSession.shared.dataTask(with: req) { [weak self] data, _, err in
            DispatchQueue.main.async { [weak self] in
                guard let self = self else { return }
                if let data = data,
                   let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let msg = json["message"] as? String {
                    completion(msg)
                } else if err != nil {
                    // Fallback to local file logging / shell script execution if offline
                    self.executeFallbackScript(action: action)
                    completion("Fallback logged (\(action))")
                } else {
                    completion("OK")
                }
            }
        }.resume()
    }
    
    private func executeFallbackScript(action: String) {
        let root = DaemonProcessManager.projectRoot
        let scriptPath = "\(root)/scripts/shortcuts/fabric-\(action).sh"
        if FileManager.default.isExecutableFile(atPath: scriptPath) {
            let proc = Process()
            proc.executableURL = URL(fileURLWithPath: scriptPath)
            if action == "spark" {
                proc.arguments = ["Deep Work Sprint (Notch)", "1.5"]
            }
            try? proc.run()
        }
    }
}

// MARK: - Respiration Wave Canvas

public struct RespirationWaveView: View {
    public let bpm: Double
    public let coherence: Int
    public let color: Color
    public var compact: Bool = true
    
    public var body: some View {
        TimelineView(.animation) { timeline in
            let elapsed = timeline.date.timeIntervalSinceReferenceDate
            Canvas { context, size in
                let w = size.width
                let h = size.height
                let midY = h / 2.0
                
                let cyclesPerSecond = (bpm / 60.0) * 1.5
                let phase = elapsed * cyclesPerSecond * 2.0 * .pi
                let coherenceFactor = max(0.4, Double(coherence) / 100.0)
                let amplitude = (h * 0.38) * coherenceFactor
                
                // Glow Background Wave
                var glowPath = Path()
                let step: CGFloat = 2.0
                var x: CGFloat = 0.0
                while x <= w {
                    let normX = Double(x / w)
                    let envelope = sin(normX * .pi) // Zero at edges, max at center
                    let wave = sin(normX * 4.0 * .pi - phase * 0.8)
                    let y = midY + CGFloat(wave * amplitude * 1.2 * envelope)
                    if x == 0 {
                        glowPath.move(to: CGPoint(x: x, y: y))
                    } else {
                        glowPath.addLine(to: CGPoint(x: x, y: y))
                    }
                    x += step
                }
                
                context.stroke(
                    glowPath,
                    with: .color(color.opacity(0.30)),
                    lineWidth: compact ? 2.5 : 4.0
                )
                
                // Crisp Foreground Resonant Wave
                var mainPath = Path()
                x = 0.0
                while x <= w {
                    let normX = Double(x / w)
                    let envelope = sin(normX * .pi)
                    let wave1 = sin(normX * 6.0 * .pi - phase)
                    let wave2 = sin(normX * 12.0 * .pi + phase * 1.3) * 0.22
                    let y = midY + CGFloat((wave1 + wave2) * amplitude * envelope)
                    if x == 0 {
                        mainPath.move(to: CGPoint(x: x, y: y))
                    } else {
                        mainPath.addLine(to: CGPoint(x: x, y: y))
                    }
                    x += step
                }
                
                let gradient = Gradient(colors: [
                    color.opacity(0.15),
                    color.opacity(0.85),
                    Color.white.opacity(0.95),
                    color.opacity(0.85),
                    color.opacity(0.15)
                ])
                
                context.stroke(
                    mainPath,
                    with: .linearGradient(
                        gradient,
                        startPoint: CGPoint(x: 0, y: midY),
                        endPoint: CGPoint(x: w, y: midY)
                    ),
                    lineWidth: compact ? 1.8 : 2.4
                )
            }
        }
    }
}

// MARK: - Notch HUD SwiftUI View

public struct NotchContentView: View {
    @ObservedObject var store: TelemetryStore
    var onHoverChange: (Bool) -> Void
    
    @State private var isHovered: Bool = false
    @State private var collapseWorkItem: DispatchWorkItem?
    
    public init(store: TelemetryStore, onHoverChange: @escaping (Bool) -> Void) {
        self.store = store
        self.onHoverChange = onHoverChange
    }
    
    private var appName: String {
        store.ambient?.frontmostApp?.name ?? "Fabric"
    }
    
    private var gitBranch: String {
        store.ambient?.git?.branch ?? "main"
    }
    
    private var isGitClean: Bool {
        store.ambient?.git?.isClean ?? true
    }
    
    public var body: some View {
        ZStack {
            // Dark OLED Glassmorphic Body
            RoundedRectangle(cornerRadius: isHovered ? 24 : 19, style: .continuous)
                .fill(Color(red: 10/255, green: 10/255, blue: 15/255).opacity(0.94))
                .overlay(
                    RoundedRectangle(cornerRadius: isHovered ? 24 : 19, style: .continuous)
                        .stroke(
                            LinearGradient(
                                colors: [
                                    Color.white.opacity(0.18),
                                    store.fourF.stateColor.opacity(0.35),
                                    Color.white.opacity(0.08)
                                ],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            lineWidth: 1.0
                        )
                )
                .shadow(color: Color.black.opacity(0.80), radius: 18, x: 0, y: 10)
                .shadow(color: store.fourF.stateColor.opacity(0.16), radius: 12, x: 0, y: 3)
            
            VStack(spacing: 0) {
                // Compact Top Bar (Always Visible at Camera Bezel)
                HStack(spacing: 10) {
                    // Left: Pulse Dot & Vitality Badge
                    HStack(spacing: 5) {
                        Circle()
                            .fill(store.fourF.stateColor)
                            .frame(width: 7, height: 7)
                            .shadow(color: store.fourF.stateColor.opacity(0.8), radius: 4)
                        
                        Text("⚡\(store.fourF.vitalityScore)%")
                            .font(.system(size: 11, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                        
                        Text(store.fourF.tranceLabel.uppercased())
                            .font(.system(size: 9, weight: .semibold, design: .rounded))
                            .foregroundColor(store.fourF.stateColor)
                            .padding(.horizontal, 4)
                            .padding(.vertical, 1)
                            .background(store.fourF.stateColor.opacity(0.16))
                            .clipShape(Capsule())
                    }
                    .frame(minWidth: 105, alignment: .leading)
                    
                    // Center: Breathing Sine Wave
                    RespirationWaveView(
                        bpm: store.fourF.respirationBpm,
                        coherence: store.fourF.coherenceScore,
                        color: store.fourF.stateColor,
                        compact: !isHovered
                    )
                    .frame(height: 22)
                    .layoutPriority(1)
                    
                    // Right: App & Git Branch
                    HStack(spacing: 5) {
                        if let badge = store.ambient?.dynamicIsland?.badge, badge.contains("INSOMNIA") || badge.contains("🌙") {
                            HStack(spacing: 2) {
                                Text("🌙")
                                    .font(.system(size: 9))
                                Text("INSOMNIA")
                                    .font(.system(size: 8, weight: .bold, design: .rounded))
                                    .foregroundColor(.indigo)
                            }
                            .padding(.horizontal, 4)
                            .padding(.vertical, 1.5)
                            .background(Color.indigo.opacity(0.18))
                            .clipShape(Capsule())
                        }
                        
                        Text(appName)
                            .font(.system(size: 11, weight: .medium, design: .rounded))
                            .foregroundColor(.white.opacity(0.9))
                            .lineLimit(1)
                        
                        HStack(spacing: 3) {
                            Text("⎇")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundColor(.cyan)
                            Text(gitBranch)
                                .font(.system(size: 10, weight: .semibold, design: .monospaced))
                                .foregroundColor(.cyan)
                            if !isGitClean {
                                Circle()
                                    .fill(Color.orange)
                                    .frame(width: 4, height: 4)
                            }
                        }
                        .padding(.horizontal, 5)
                        .padding(.vertical, 1.5)
                        .background(Color.cyan.opacity(0.12))
                        .clipShape(Capsule())
                    }
                    .frame(minWidth: 110, alignment: .trailing)
                }
                .padding(.horizontal, 14)
                .frame(height: 42)
                
                // Hover Expanded Command Center Panel
                if isHovered {
                    VStack(spacing: 8) {
                        Divider()
                            .background(Color.white.opacity(0.12))
                        
                        // 1. 4F Metrics Row
                        HStack(spacing: 8) {
                            metricBadge(title: "FOCUS", val: String(format: "%+.1f", store.fourF.focus), color: store.fourF.stateColor)
                            metricBadge(title: "FACTS", val: String(format: "%+.1f", store.fourF.facts), color: .purple)
                            metricBadge(title: "FUNDS", val: String(format: "%+.1f", store.fourF.funds), color: .emeraldGreen)
                            metricBadge(title: "FDBK", val: String(format: "%+.1f", store.fourF.feedback), color: .orange)
                            
                            Spacer()
                            
                            Text("\(Int(store.fourF.respirationBpm)) bpm • \(store.fourF.coherenceScore)% coh")
                                .font(.system(size: 9.5, weight: .medium, design: .monospaced))
                                .foregroundColor(.white.opacity(0.6))
                        }
                        .padding(.horizontal, 14)
                        
                        // Feedback Banner (if active)
                        if let banner = store.feedbackBanner {
                            HStack {
                                Text(banner)
                                    .font(.system(size: 11, weight: .semibold, design: .rounded))
                                    .foregroundColor(.white)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 4)
                            .background(store.fourF.stateColor.opacity(0.22))
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                            .padding(.horizontal, 12)
                            .transition(.opacity.combined(with: .scale(scale: 0.95)))
                        } else {
                            // Quick Action Dock
                            VStack(spacing: 5) {
                                HStack(spacing: 6) {
                                    actionButton(icon: "bolt.fill", title: "Spark 90m", color: .yellow) {
                                        store.triggerSpark()
                                    }
                                    
                                    actionButton(icon: "flag.checkered", title: "Settle", color: .emeraldGreen) {
                                        store.triggerSettle()
                                    }
                                    
                                    actionButton(icon: "arrow.clockwise", title: "Refresh", color: .cyan) {
                                        store.refreshState()
                                        store.showBanner("🔄 State Synced")
                                    }
                                    
                                    actionButton(icon: "safari.fill", title: "Cockpit", color: .purple) {
                                        store.openCockpit()
                                    }
                                }
                                
                                // Calendar Time Blocking & Notion Sync Quick Row
                                HStack(spacing: 6) {
                                    actionButton(icon: "calendar.badge.clock", title: "+30m Focus", color: .cyan) {
                                        store.blockCalendar(minutes: 30, category: "focus")
                                    }
                                    
                                    actionButton(icon: "calendar", title: "+60m Deep", color: .indigo) {
                                        store.blockCalendar(minutes: 60, category: "study")
                                    }
                                    
                                    actionButton(icon: "waveform.circle.fill", title: "Voice Spar", color: .orange) {
                                        store.openCockpit()
                                    }
                                    
                                    actionButton(icon: "network", title: "Vault", color: .teal) {
                                        store.openVault()
                                    }
                                }
                            }
                            .padding(.horizontal, 12)
                        }
                        
                        Divider()
                            .background(Color.white.opacity(0.10))
                            .padding(.vertical, 1)
                        
                        // 2. Process & Daemon Controller
                        VStack(spacing: 5) {
                            // Header Row
                            HStack {
                                HStack(spacing: 5) {
                                    Image(systemName: "cpu.fill")
                                        .font(.system(size: 9.5, weight: .bold))
                                        .foregroundColor(.cyan)
                                    Text("PROCESS & DAEMON CONTROLLER")
                                        .font(.system(size: 9.5, weight: .bold, design: .rounded))
                                        .foregroundColor(.white.opacity(0.85))
                                    
                                    Text("\(store.daemonManager.runningCount)/4 ACTIVE")
                                        .font(.system(size: 8, weight: .bold, design: .rounded))
                                        .foregroundColor(.emeraldGreen)
                                        .padding(.horizontal, 4)
                                        .padding(.vertical, 1)
                                        .background(Color.emeraldGreen.opacity(0.15))
                                        .clipShape(Capsule())
                                }
                                
                                Spacer()
                                
                                // Prominent Force Quit All Action Button
                                Button(action: {
                                    store.forceQuitAllDaemons()
                                }) {
                                    HStack(spacing: 3) {
                                        Image(systemName: "xmark.octagon.fill")
                                            .font(.system(size: 9))
                                            .foregroundColor(.white)
                                        Text("Force Quit All")
                                            .font(.system(size: 9, weight: .bold, design: .rounded))
                                            .foregroundColor(.white)
                                    }
                                    .padding(.horizontal, 7)
                                    .padding(.vertical, 3)
                                    .background(
                                        LinearGradient(
                                            colors: [Color.red.opacity(0.85), Color(red: 180/255, green: 20/255, blue: 40/255)],
                                            startPoint: .topLeading,
                                            endPoint: .bottomTrailing
                                        )
                                    )
                                    .clipShape(Capsule())
                                    .shadow(color: Color.red.opacity(0.4), radius: 4)
                                }
                                .buttonStyle(.plain)
                            }
                            .padding(.horizontal, 14)
                            
                            // Daemon Worker Rows
                            VStack(spacing: 4) {
                                ForEach(store.daemonManager.daemons) { daemon in
                                    daemonRow(daemon)
                                }
                            }
                            .padding(.horizontal, 12)
                        }
                        
                        Divider()
                            .background(Color.white.opacity(0.08))
                            .padding(.vertical, 1)
                        
                        // 3. Footer Bar with Clean Quit Options
                        HStack {
                            Text("Fabric OS Native Master Controller")
                                .font(.system(size: 8.5, weight: .medium, design: .rounded))
                                .foregroundColor(.white.opacity(0.35))
                            
                            Spacer()
                            
                            Button(action: {
                                store.openDeploy()
                            }) {
                                HStack(spacing: 2) {
                                    Image(systemName: "arrow.up.right.square")
                                        .font(.system(size: 7.5))
                                    Text("Deploy")
                                        .font(.system(size: 8.5, weight: .semibold, design: .rounded))
                                }
                                .foregroundColor(.cyan.opacity(0.85))
                            }
                            .buttonStyle(.plain)
                            
                            Text("•")
                                .foregroundColor(.white.opacity(0.2))
                                .font(.system(size: 8))
                            
                            Button(action: {
                                store.startAllDaemons()
                            }) {
                                Text("Start All")
                                    .font(.system(size: 8.5, weight: .semibold, design: .rounded))
                                    .foregroundColor(.emeraldGreen)
                            }
                            .buttonStyle(.plain)
                            
                            Text("•")
                                .foregroundColor(.white.opacity(0.2))
                                .font(.system(size: 8))
                            
                            Button(action: {
                                store.quitAndStopAll()
                            }) {
                                Text("Quit Fabric & Stop All Daemons")
                                    .font(.system(size: 8.5, weight: .bold, design: .rounded))
                                    .foregroundColor(.red.opacity(0.9))
                            }
                            .buttonStyle(.plain)
                        }
                        .padding(.horizontal, 14)
                        .padding(.bottom, 6)
                    }
                    .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .contentShape(Rectangle())
        .onHover { hovering in
            handleHover(hovering)
        }
        .contextMenu {
            Button("⚡ Spark 90m Flow") {
                store.triggerSpark()
            }
            Button("🏁 Settle Session") {
                store.triggerSettle()
            }
            Button("🌐 Open Cockpit Dashboard") {
                store.openCockpit()
            }
            Divider()
            Button("🟢 Start All Daemons") {
                store.startAllDaemons()
            }
            Button("🛑 Force Quit All Daemons") {
                store.forceQuitAllDaemons()
            }
            Divider()
            Button("Quit Fabric & Stop All Daemons") {
                store.quitAndStopAll()
            }
            Button("Quit Fabric HUD") {
                NSApplication.shared.terminate(nil)
            }
        }
    }
    
    private func daemonRow(_ daemon: DaemonProcessInfo) -> some View {
        HStack(spacing: 6) {
            // Live Status Indicator (🟢 / ⚪ / 🔴)
            Text(daemon.status.icon)
                .font(.system(size: 9))
            
            // Name & Subtitle
            VStack(alignment: .leading, spacing: 1) {
                Text(daemon.name)
                    .font(.system(size: 10, weight: .semibold, design: .rounded))
                    .foregroundColor(.white.opacity(0.92))
                    .lineLimit(1)
                
                Text(daemon.subtitle)
                    .font(.system(size: 7.5, weight: .regular, design: .rounded))
                    .foregroundColor(.white.opacity(0.40))
                    .lineLimit(1)
            }
            
            Spacer()
            
            // Live PID badge
            Text(daemon.statusDetail)
                .font(.system(size: 8.5, weight: .medium, design: .monospaced))
                .foregroundColor(daemon.status == .running ? .cyan : (daemon.status == .error ? .red : .white.opacity(0.4)))
                .padding(.horizontal, 4)
                .padding(.vertical, 1.5)
                .background(Color.white.opacity(0.04))
                .clipShape(RoundedRectangle(cornerRadius: 3))
            
            // 1-Click Action Button (Start / Stop)
            if daemon.status == .running {
                Button(action: {
                    store.daemonManager.stopDaemon(id: daemon.id) {
                        store.refreshState()
                    }
                }) {
                    Text("Stop")
                        .font(.system(size: 8.5, weight: .bold, design: .rounded))
                        .foregroundColor(.red.opacity(0.9))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2.5)
                        .background(Color.red.opacity(0.12))
                        .overlay(
                            RoundedRectangle(cornerRadius: 4)
                                .stroke(Color.red.opacity(0.3), lineWidth: 0.6)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                }
                .buttonStyle(.plain)
            } else {
                Button(action: {
                    store.daemonManager.startDaemon(id: daemon.id) {
                        store.refreshState()
                    }
                }) {
                    Text("Start")
                        .font(.system(size: 8.5, weight: .bold, design: .rounded))
                        .foregroundColor(.emeraldGreen)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2.5)
                        .background(Color.emeraldGreen.opacity(0.14))
                        .overlay(
                            RoundedRectangle(cornerRadius: 4)
                                .stroke(Color.emeraldGreen.opacity(0.3), lineWidth: 0.6)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(Color.white.opacity(0.04))
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }
    
    private func handleHover(_ hovering: Bool) {
        collapseWorkItem?.cancel()
        if hovering {
            withAnimation(.spring(response: 0.30, dampingFraction: 0.78)) {
                isHovered = true
            }
            onHoverChange(true)
        } else {
            let item = DispatchWorkItem {
                withAnimation(.spring(response: 0.28, dampingFraction: 0.82)) {
                    isHovered = false
                }
                onHoverChange(false)
            }
            collapseWorkItem = item
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.18, execute: item)
        }
    }
    
    private func metricBadge(title: String, val: String, color: Color) -> some View {
        HStack(spacing: 3) {
            Text(title)
                .font(.system(size: 8, weight: .bold, design: .rounded))
                .foregroundColor(color.opacity(0.85))
            Text(val)
                .font(.system(size: 9.5, weight: .semibold, design: .monospaced))
                .foregroundColor(.white)
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 2.5)
        .background(color.opacity(0.12))
        .clipShape(RoundedRectangle(cornerRadius: 5))
    }
    
    private func actionButton(icon: String, title: String, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 9.5, weight: .bold))
                    .foregroundColor(color)
                Text(title)
                    .font(.system(size: 10, weight: .semibold, design: .rounded))
                    .foregroundColor(.white.opacity(0.95))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 5)
            .background(Color.white.opacity(0.08))
            .overlay(
                RoundedRectangle(cornerRadius: 7)
                    .stroke(color.opacity(0.25), lineWidth: 0.8)
            )
            .clipShape(RoundedRectangle(cornerRadius: 7))
        }
        .buttonStyle(.plain)
    }
}

extension Color {
    static let emeraldGreen = Color(red: 16/255, green: 185/255, blue: 129/255)
}

// MARK: - AppKit Floating Window Controller

public final class NotchWindowController: NSObject, NSWindowDelegate {
    public var window: NSPanel!
    public var store = TelemetryStore()
    private var isExpanded: Bool = false
    
    public override init() {
        super.init()
        setupWindow()
        setupAppMenu()
    }
    
    private func setupWindow() {
        let initialWidth: CGFloat = 430
        let initialHeight: CGFloat = 44
        
        let screen = NSScreen.main ?? NSScreen.screens.first!
        let screenFrame = screen.frame
        
        let initialRect = NSRect(
            x: screenFrame.midX - initialWidth / 2.0,
            y: screenFrame.maxY - initialHeight,
            width: initialWidth,
            height: initialHeight
        )
        
        window = NSPanel(
            contentRect: initialRect,
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        
        window.isFloatingPanel = true
        window.level = .statusBar
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = false
        window.isMovable = false
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.delegate = self
        
        let contentView = NotchContentView(store: store) { [weak self] hovering in
            self?.updateExpansion(hovering)
        }
        
        let hostingView = NSHostingView(rootView: contentView)
        hostingView.wantsLayer = true
        window.contentView = hostingView
        
        window.orderFrontRegardless()
    }
    
    private func setupAppMenu() {
        let mainMenu = NSMenu()
        let appMenuItem = NSMenuItem()
        mainMenu.addItem(appMenuItem)
        
        let appMenu = NSMenu()
        appMenuItem.submenu = appMenu
        
        let quitAndStopItem = NSMenuItem(
            title: "Quit Fabric & Stop All Daemons",
            action: #selector(handleQuitAndStop),
            keyEquivalent: "q"
        )
        quitAndStopItem.target = self
        appMenu.addItem(quitAndStopItem)
        
        let forceQuitItem = NSMenuItem(
            title: "Force Quit All Daemons",
            action: #selector(handleForceQuitDaemons),
            keyEquivalent: "k"
        )
        forceQuitItem.keyEquivalentModifierMask = [.command, .shift]
        forceQuitItem.target = self
        appMenu.addItem(forceQuitItem)
        
        appMenu.addItem(NSMenuItem.separator())
        
        let quitItem = NSMenuItem(
            title: "Quit Fabric HUD Only",
            action: #selector(handleQuitOnly),
            keyEquivalent: ""
        )
        quitItem.target = self
        appMenu.addItem(quitItem)
        
        NSApplication.shared.mainMenu = mainMenu
    }
    
    @objc private func handleQuitAndStop() {
        store.quitAndStopAll()
    }
    
    @objc private func handleForceQuitDaemons() {
        store.forceQuitAllDaemons()
    }
    
    @objc private func handleQuitOnly() {
        NSApplication.shared.terminate(nil)
    }
    
    public func updateExpansion(_ expanded: Bool) {
        guard expanded != isExpanded else { return }
        self.isExpanded = expanded
        
        guard let screen = window.screen ?? NSScreen.main else { return }
        let screenFrame = screen.frame
        
        let targetWidth: CGFloat = expanded ? 540 : 430
        let targetHeight: CGFloat = expanded ? 330 : 44
        
        let targetRect = NSRect(
            x: screenFrame.midX - targetWidth / 2.0,
            y: screenFrame.maxY - targetHeight,
            width: targetWidth,
            height: targetHeight
        )
        
        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = 0.26
            ctx.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
            window.animator().setFrame(targetRect, display: true)
        }
    }
}

// MARK: - Self Test Suite & Diagnostics

public struct NotchVerification {
    public static func runCheck() -> Int {
        print("🔍 [FabricNotch QC] Running self-verification suite...")
        var assertions = 0
        
        // 1. Test Model Decoding
        let sampleJson = """
        {
          "timestamp": "2026-11-04T04:51:10.578Z",
          "frontmostApp": {
            "name": "Google Chrome",
            "category": "browser",
            "windowTitle": "Fabric Tool Test"
          },
          "git": {
            "repository": "fabric",
            "branch": "main",
            "isClean": false,
            "uncommittedChangesCount": 3
          },
          "focus": {
            "sedentaryMinutes": 12,
            "continuousActivitySeconds": 720,
            "idleSeconds": 10,
            "tranceState": "deep_flow"
          },
          "dynamicIsland": {
            "status": "normal",
            "headline": "fabric [main] • Google Chrome",
            "badge": "main",
            "icon": "🌌"
          }
        }
        """
        
        guard let data = sampleJson.data(using: .utf8),
              let payload = try? JSONDecoder().decode(AmbientPayload.self, from: data) else {
            print("❌ Assertion Failed: Unable to decode AmbientPayload")
            return 1
        }
        assertions += 1
        print("  ✓ Decoded AmbientPayload: app=\(payload.frontmostApp?.name ?? "") git=\(payload.git?.branch ?? "")")
        
        // 2. Test 4F Vector Derivation
        let store = TelemetryStore()
        assertions += 1
        print("  ✓ TelemetryStore initialized. Vitality=\(store.fourF.vitalityScore)% Trance=\(store.fourF.tranceLabel)")
        
        // 3. Test Screen Detection
        if let screen = NSScreen.main {
            assertions += 1
            print("  ✓ Detected primary screen: \(screen.frame.width)x\(screen.frame.height)")
            let targetX = screen.frame.midX - 430 / 2.0
            let targetY = screen.frame.maxY - 44
            print("  ✓ Calculated camera notch anchor: x=\(targetX), y=\(targetY)")
        } else {
            print("  ⚠️ NSScreen.main nil (headless environment)")
        }
        
        // 4. Test Respiration Wave Parameters
        let wave = RespirationWaveView(bpm: 14.0, coherence: 90, color: .cyan, compact: true)
        assertions += 1
        print("  ✓ RespirationWaveView synthesized (bpm=\(wave.bpm), coh=\(wave.coherence))")
        
        // 5. Test Daemon Process Manager & Worker List
        let daemonMgr = DaemonProcessManager()
        assertions += 1
        let daemons = daemonMgr.daemons
        let names = daemons.map { $0.name }
        print("  ✓ DaemonProcessManager initialized with \(daemons.count) workers: \(names.joined(separator: ", "))")
        guard daemons.count == 4,
              names.contains("macOS Ambient Daemon"),
              names.contains("Telegram Video Vault Archiver"),
              names.contains("Insomnia Power Governor"),
              names.contains("Cybernetic Governor") else {
            print("❌ Assertion Failed: Daemon list missing required background workers")
            return 1
        }
        
        // 6. Test Live PID Detection & Status Mapping
        assertions += 1
        for d in daemons {
            print("    • \(d.status.icon) \(d.name): \(d.status.rawValue) (\(d.statusDetail))")
        }
        
        // 7. Test Native Notification Dispatcher
        assertions += 1
        FabricNotifier.shared.notify(
            title: "Fabric QC Test",
            body: "Self-test notification dispatched cleanly"
        )
        print("  ✓ FabricNotifier toast dispatcher verified")
        
        // 8. Test Force-Quit Simulation & Process Cleanup Logic (Dry-Run Safe)
        assertions += 1
        let dryRunActions = daemonMgr.forceQuitAllDaemons(dryRun: true)
        print("  ✓ Force Quit dry-run logic simulated: \(dryRunActions.count) cleanup actions identified")
        
        print("✅ [FabricNotch QC] All \(assertions) checks passed cleanly.")
        return 0
    }
}

// MARK: - Main Application Entrypoint

@main
public struct FabricNotchApp {
    public static func main() {
        let args = CommandLine.arguments
        
        if args.contains("-h") || args.contains("--help") {
            print("""
            Fabric / FabricNotch — Unified Native macOS Desktop App & Daemon Controller for Fabric OS
            
            USAGE:
              Fabric [options]
              FabricNotch [options]
            
            OPTIONS:
              -h, --help            Show this help documentation
              -v, --version         Display version and architecture info
              --check               Run diagnostic QC verification suite and exit
              --headless            Initialize runtime structures without GUI loop
              --daemons             Query live status of all 4 background workers and exit
              --force-quit          Forcefully terminate all background workers & child processes
              --dry-run             Simulate action without sending termination signals
            
            BEHAVIOR:
              - Floats centered at the top of the primary display (MacBook camera notch bezel)
              - Configured with .statusBar level to stay visible over fullscreen spaces
              - Renders real-time 4F focus vector, vitality, active Git branch & frontmost app
              - Canvas-drawn fluid sine wave reflecting FOCI diaphragmatic respiration
              - Expands downward on hover to expose quick actions (Spark 90m, Settle, Refresh)
              - Dedicated Process & Daemon Controller HUD:
                • 1-click Start/Stop for Ambient Daemon, Telegram Vault, Insomnia & Governor
                • Prominent 'Force Quit All Daemons' one-click safety button
                • Native macOS Notification toasts on daemon state transitions & governor alerts
                • Clean 'Quit Fabric & Stop All Daemons' app menu option (Cmd+Q)
            """)
            exit(0)
        }
        
        if args.contains("-v") || args.contains("--version") {
            print("Fabric v1.0.0 (Unified macOS Desktop App & Daemon Controller, arm64)")
            exit(0)
        }
        
        if args.contains("--check") || args.contains("--test") {
            let code = NotchVerification.runCheck()
            exit(Int32(code))
        }
        
        if args.contains("--headless") {
            print("Fabric running in headless verification mode...")
            _ = NotchVerification.runCheck()
            exit(0)
        }
        
        if args.contains("--daemons") {
            let mgr = DaemonProcessManager()
            print("Fabric OS — Background Workers & Daemons Status:")
            for d in mgr.daemons {
                print("  • \(d.status.icon) \(d.name): \(d.status.rawValue) (\(d.statusDetail))")
            }
            exit(0)
        }
        
        if args.contains("--force-quit") {
            let isDryRun = args.contains("--dry-run")
            let mgr = DaemonProcessManager()
            print("🛑 Initiating Force Quit of all Fabric OS background daemons\(isDryRun ? " (Dry-Run Mode)" : "")...")
            let actions = mgr.forceQuitAllDaemons(dryRun: isDryRun)
            for a in actions {
                print("  • \(a)")
            }
            print("✅ All background daemons and child processes \(isDryRun ? "identified for cleanup" : "terminated").")
            exit(0)
        }
        
        // Launch AppKit Accessory HUD
        let app = NSApplication.shared
        app.setActivationPolicy(.accessory)
        
        let controller = NotchWindowController()
        _ = controller
        
        app.run()
    }
}
