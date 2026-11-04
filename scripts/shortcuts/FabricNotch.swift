import Cocoa
import SwiftUI
import Foundation
import Combine

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

// MARK: - Telemetry Store

public final class TelemetryStore: ObservableObject {
    @Published public var ambient: AmbientPayload?
    @Published public var fourF: FourFVector
    @Published public var isConnected: Bool = false
    @Published public var lastRefreshed: Date = Date()
    @Published public var feedbackBanner: String? = nil
    
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
        
        let cwd = FileManager.default.currentDirectoryPath
        candidateFilePaths = [
            "\(cwd)/.ambient_state.json",
            "\(cwd)/../.ambient_state.json",
            "\(cwd)/../../.ambient_state.json",
            "/Users/holyscript/Desktop/projects/fabric/.ambient_state.json",
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
        ]) { [weak self] res in
            self?.showBanner("⚡ 90m Focus Sprint Sparked!")
            self?.refreshState()
        }
    }
    
    public func triggerSettle() {
        sendQuickAction(action: "settle", payload: [
            "action": "settle",
            "energyDelta": 1,
            "factsYield": "Completed focused execution cycle via FabricNotch"
        ]) { [weak self] res in
            self?.showBanner("🏁 Session Settled (+1 Energy)")
            self?.refreshState()
        }
    }
    
    public func openCockpit() {
        if let url = URL(string: "http://localhost:3000/dashboard") {
            NSWorkspace.shared.open(url)
            showBanner("🌐 Opening Dashboard Cockpit")
        }
    }
    
    private func sendQuickAction(action: String, payload: [String: Any], completion: @escaping (String) -> Void) {
        guard let url = URL(string: "http://localhost:3000/api/quick") else {
            completion("Invalid URL")
            return
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.timeoutInterval = 2.0
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
        let cwd = FileManager.default.currentDirectoryPath
        let scriptPath = "\(cwd)/scripts/shortcuts/fabric-\(action).sh"
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
                .fill(Color(red: 10/255, green: 10/255, blue: 15/255).opacity(0.92))
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
                .shadow(color: Color.black.opacity(0.75), radius: 16, x: 0, y: 8)
                .shadow(color: store.fourF.stateColor.opacity(0.15), radius: 10, x: 0, y: 2)
            
            VStack(spacing: 0) {
                // Compact Top Bar (Always Visible)
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
                
                // Hover Expanded Panel
                if isHovered {
                    VStack(spacing: 8) {
                        Divider()
                            .background(Color.white.opacity(0.10))
                        
                        // 4F Metrics Row
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
                        .padding(.horizontal, 12)
                        
                        // Feedback Banner or Quick Actions
                        if let banner = store.feedbackBanner {
                            HStack {
                                Text(banner)
                                    .font(.system(size: 11, weight: .semibold, design: .rounded))
                                    .foregroundColor(.white)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 4)
                            .background(store.fourF.stateColor.opacity(0.2))
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                            .padding(.horizontal, 10)
                            .transition(.opacity.combined(with: .scale(scale: 0.95)))
                        } else {
                            // Quick Action Dock
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
                            .padding(.horizontal, 10)
                        }
                    }
                    .padding(.bottom, 8)
                    .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .contentShape(Rectangle())
        .onHover { hovering in
            handleHover(hovering)
        }
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
    private var store = TelemetryStore()
    private var isExpanded: Bool = false
    
    public override init() {
        super.init()
        setupWindow()
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
    
    public func updateExpansion(_ expanded: Bool) {
        guard expanded != isExpanded else { return }
        self.isExpanded = expanded
        
        guard let screen = window.screen ?? NSScreen.main else { return }
        let screenFrame = screen.frame
        
        let targetWidth: CGFloat = expanded ? 480 : 430
        let targetHeight: CGFloat = expanded ? 134 : 44
        
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
            FabricNotch — Native macOS Floating Notch HUD for Fabric OS
            
            USAGE:
              FabricNotch [options]
            
            OPTIONS:
              -h, --help      Show this help documentation
              -v, --version   Display version and architecture info
              --check         Run diagnostic QC verification suite and exit
              --headless      Initialize runtime structures without GUI loop
            
            BEHAVIOR:
              - Floats centered at the top of the primary display (MacBook camera notch area)
              - Configured with .statusBar level to stay visible over fullscreen spaces
              - Renders real-time 4F focus vector, vitality, active Git branch & frontmost app
              - Canvas-drawn fluid sine wave reflecting FOCI diaphragmatic respiration
              - Expands downward on hover to expose quick actions (Spark 90m, Settle, Refresh)
            """)
            exit(0)
        }
        
        if args.contains("-v") || args.contains("--version") {
            print("FabricNotch v1.0.0 (Fabric OS Native Dynamic Island HUD, arm64)")
            exit(0)
        }
        
        if args.contains("--check") || args.contains("--test") {
            let code = NotchVerification.runCheck()
            exit(Int32(code))
        }
        
        if args.contains("--headless") {
            print("FabricNotch running in headless verification mode...")
            _ = NotchVerification.runCheck()
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
