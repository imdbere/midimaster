use mdns_sd::{ServiceDaemon, ServiceInfo};
use std::net::{IpAddr, UdpSocket};

pub fn get_mdns_hostname() -> String {
    let raw = gethostname();
    let clean: String = raw
        .chars()
        .filter(|c| c.is_alphanumeric())
        .collect::<String>()
        .to_lowercase();
    let trimmed = if clean.len() > 10 { &clean[..10] } else { &clean };
    format!("midimaster-{trimmed}")
}

pub fn get_local_ip() -> Option<String> {
    // Connect a UDP socket (doesn't send data) to get the preferred outbound IP
    UdpSocket::bind("0.0.0.0:0")
        .ok()
        .and_then(|s| {
            s.connect("8.8.8.8:80").ok()?;
            s.local_addr().ok()
        })
        .and_then(|addr| match addr.ip() {
            IpAddr::V4(ip) if !ip.is_loopback() => Some(ip.to_string()),
            _ => None,
        })
}

pub fn advertise(port: u16) {
    std::thread::spawn(move || {
        let hostname = get_mdns_hostname();
        let Ok(mdns) = ServiceDaemon::new() else {
            eprintln!("mDNS: failed to create daemon");
            return;
        };

        let host_name = format!("{hostname}.local.");
        let ip = get_local_ip().unwrap_or_default();

        let service = match ServiceInfo::new(
            "_http._tcp.local.",
            &hostname,
            &host_name,
            ip.as_str(),
            port,
            None,
        ) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("mDNS: failed to create service info: {e}");
                return;
            }
        };

        if let Err(e) = mdns.register(service) {
            eprintln!("mDNS: register error: {e}");
        } else {
            println!("mDNS: advertising {hostname}.local:{port}");
        }

        // Keep the daemon alive
        loop {
            std::thread::sleep(std::time::Duration::from_secs(60));
        }
    });
}

fn gethostname() -> String {
    hostname::get()
        .ok()
        .and_then(|h| h.into_string().ok())
        .unwrap_or_else(|| "midimaster".to_string())
}
