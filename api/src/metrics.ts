// Prometheus metrics collection for production monitoring
// In production, expose these at /metrics endpoint for Prometheus scraping

interface Metric {
  name: string;
  type: "counter" | "gauge" | "histogram";
  help: string;
  values: Map<string, number>;
}

class MetricsRegistry {
  private metrics = new Map<string, Metric>();

  register(name: string, type: "counter" | "gauge" | "histogram", help: string): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, { name, type, help, values: new Map() });
    }
  }

  increment(name: string, labels: Record<string, string> = {}, value = 1): void {
    const metric = this.metrics.get(name);
    if (metric && metric.type === "counter") {
      const key = this.labelKey(labels);
      const current = metric.values.get(key) || 0;
      metric.values.set(key, current + value);
    }
  }

  set(name: string, value: number, labels: Record<string, string> = {}): void {
    const metric = this.metrics.get(name);
    if (metric && metric.type === "gauge") {
      const key = this.labelKey(labels);
      metric.values.set(key, value);
    }
  }

  observe(name: string, value: number, labels: Record<string, string> = {}): void {
    const metric = this.metrics.get(name);
    if (metric && metric.type === "histogram") {
      const key = this.labelKey(labels);
      const current = metric.values.get(key) || 0;
      metric.values.set(key, current + value);
    }
  }

  private labelKey(labels: Record<string, string>): string {
    return Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(",");
  }

  // Export metrics in Prometheus text format
  export(): string {
    let output = "";
    for (const metric of this.metrics.values()) {
      output += `# HELP ${metric.name} ${metric.help}\n`;
      output += `# TYPE ${metric.name} ${metric.type}\n`;
      for (const [labels, value] of metric.values.entries()) {
        if (labels) {
          output += `${metric.name}{${labels}} ${value}\n`;
        } else {
          output += `${metric.name} ${value}\n`;
        }
      }
    }
    return output;
  }
}

const registry = new MetricsRegistry();

// Register default metrics
registry.register("http_requests_total", "counter", "Total HTTP requests");
registry.register("http_request_duration_ms", "histogram", "HTTP request duration in milliseconds");
registry.register("http_requests_in_progress", "gauge", "Number of HTTP requests in progress");
registry.register("neo4j_query_duration_ms", "histogram", "Neo4j query duration in milliseconds");
registry.register("neo4j_connections_active", "gauge", "Number of active Neo4j connections");
registry.register("concurrent_users", "gauge", "Number of concurrent users");
registry.register("data_ingest_events_total", "counter", "Total data ingest events");
registry.register("data_ingest_errors_total", "counter", "Total data ingest errors");

export const metrics = {
  registry,
  increment: (name: string, labels?: Record<string, string>, value?: number) => registry.increment(name, labels, value),
  set: (name: string, value: number, labels?: Record<string, string>) => registry.set(name, value, labels),
  observe: (name: string, value: number, labels?: Record<string, string>) => registry.observe(name, value, labels),
  export: () => registry.export(),
};
